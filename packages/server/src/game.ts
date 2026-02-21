import { nanoid } from 'nanoid';
import type { Client } from './index.js';
import type {
  GameState,
  GameConfig,
  PlayerState,
  ServerMsg,
  ClientMsg,
  GameMap,
  MobInstance,
  TowerInstance,
  PlayerColor,
  GridPos,
} from '@ect/shared';
import {
  DEFAULT_GAME_CONFIG,
  GRID_SIZE,
  SHOP_SLOTS,
  PLAYER_COLORS,
  ALL_MAPS,
  TOTAL_ROUNDS,
  SHOP_PHASE_DURATION,
  FIRST_SHOP_PHASE_DURATION,
  AUGMENT_PICK_DURATION,
  TICK_MS,
  MOB_SYNC_INTERVAL,
  TOWER_MAP,
  TOWER_COSTS,
  isPathCell,
  isAugmentRound,
  generateAugmentChoices,
  AUGMENT_POOL,
} from '@ect/shared';
import { ShopManager } from './shop.js';
import { CombatManager } from './combat.js';
import { EconomyManager } from './economy.js';
import { rooms } from './lobby.js';

export class Game {
  state: GameState;
  map: GameMap;
  clients: Map<string, Client>;
  names: Map<string, string>;
  shop: ShopManager;
  combat: CombatManager;
  economy: EconomyManager;
  tickInterval: ReturnType<typeof setInterval> | null = null;
  phaseTimer: ReturnType<typeof setInterval> | null = null;
  tickCount = 0;
  roundLeaks: Map<string, number> = new Map();
  speed: number = 1;
  config: GameConfig;
  /** Track which players have picked augments this round */
  augmentPicked: Set<string> = new Set();

  constructor(clients: Client[], names: Map<string, string>, config: GameConfig = DEFAULT_GAME_CONFIG) {
    this.config = config;
    this.map = ALL_MAPS[Math.floor(Math.random() * ALL_MAPS.length)];

    this.clients = new Map();
    this.names = names;
    const playerIds: string[] = [];

    clients.forEach((c) => {
      this.clients.set(c.id, c);
      playerIds.push(c.id);
    });

    const players: PlayerState[] = playerIds.map((id, i) => ({
      id,
      name: names.get(id) || `Player ${i + 1}`,
      color: PLAYER_COLORS[i] as PlayerColor,
      hp: config.startingHp,
      gold: config.startingGold,
      towers: [],
      shop: Array(SHOP_SLOTS).fill(null),
      augments: [],
      streak: 0,
      alive: true,
    }));

    this.state = {
      phase: 'lobby',
      round: 0,
      timer: 0,
      players,
      mapId: this.map.id,
      mobs: Object.fromEntries(playerIds.map((id) => [id, []])),
      winner: null,
    };

    this.shop = new ShopManager(this.state);
    this.combat = new CombatManager(this.state, this.map);
    this.economy = new EconomyManager(this.state);
  }

  start() {
    this.startNextRound();
  }

  // ── Player Actions ──────────────────────────────────

  handlePlayerAction(playerId: string, msg: ClientMsg) {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || !player.alive) return;

    switch (msg.type) {
      case 'BUY_AND_PLACE': {
        if (this.state.phase !== 'shopping') return;
        if (msg.shopIndex < 0 || msg.shopIndex >= SHOP_SLOTS) return;
        const itemId = player.shop[msg.shopIndex];
        if (!itemId) return;

        // Validate position
        if (isPathCell(this.map, msg.position)) return;
        if (msg.position.row < 0 || msg.position.row >= GRID_SIZE ||
            msg.position.col < 0 || msg.position.col >= GRID_SIZE) return;
        if (player.towers.some((t) => t.position.row === msg.position.row && t.position.col === msg.position.col)) return;

        const def = TOWER_MAP[itemId];
        if (!def) return;

        const cost = TOWER_COSTS[def.id] || def.cost;
        if (player.gold < cost) return;

        const tower: TowerInstance = {
          instanceId: nanoid(8),
          defId: itemId,
          position: msg.position,
          stars: 0,
        };
        player.towers.push(tower);
        player.gold -= cost;
        player.shop[msg.shopIndex] = null;

        // Try fusion: 3 of same type → ★
        this.shop.tryFusion(player, itemId);

        this.sendTo(playerId, { type: 'SHOP_UPDATE', shop: player.shop, gold: player.gold });
        this.broadcastStateUpdate();
        break;
      }
      case 'SELL_TOWER': {
        if (this.state.phase !== 'shopping') return;
        if (this.shop.sellTower(player, msg.instanceId)) {
          this.broadcastStateUpdate();
        }
        break;
      }
      case 'REROLL': {
        if (this.state.phase !== 'shopping') return;
        if (this.shop.reroll(player)) {
          this.sendTo(playerId, { type: 'SHOP_UPDATE', shop: player.shop, gold: player.gold });
        }
        break;
      }
      case 'PICK_AUGMENT': {
        if (this.state.phase !== 'augmentPick') return;
        if (this.augmentPicked.has(playerId)) return;
        
        // Validate the augment is in their choices
        const choices = this.state.augmentChoices?.[playerId] || [];
        if (!choices.includes(msg.augmentId)) return;
        
        player.augments.push(msg.augmentId);
        this.augmentPicked.add(playerId);
        
        this.broadcast({ type: 'AUGMENT_PICKED', playerId, augmentId: msg.augmentId });
        
        // Check if all alive players have picked
        const alivePlayers = this.state.players.filter(p => p.alive);
        if (alivePlayers.every(p => this.augmentPicked.has(p.id))) {
          if (this.phaseTimer) { clearInterval(this.phaseTimer); this.phaseTimer = null; }
          this.startShopPhase();
        }
        break;
      }
      case 'DEV_START_COMBAT': {
        if (this.state.phase !== 'shopping') return;
        if (this.phaseTimer) { clearInterval(this.phaseTimer); this.phaseTimer = null; }
        this.state.timer = 0;
        this.startCombat();
        break;
      }
      case 'SET_SPEED': {
        const s = msg.speed;
        if (![1, 2, 3, 5, 10].includes(s)) return;
        this.speed = s;
        this.broadcast({ type: 'SPEED_CHANGE', speed: s });
        break;
      }
    }
  }

  // ── Broadcast ───────────────────────────────────────

  broadcast(msg: ServerMsg) {
    const raw = JSON.stringify(msg);
    this.clients.forEach((client) => {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(raw);
      }
    });
  }

  broadcastStateUpdate() {
    this.clients.forEach((client) => {
      if (client.ws.readyState === client.ws.OPEN) {
        const filteredState = this.getFilteredStateForPlayer(client.id);
        const msg = JSON.stringify({
          type: 'STATE_UPDATE',
          state: filteredState,
        } as ServerMsg);
        client.ws.send(msg);
      }
    });
  }

  getFilteredStateForPlayer(playerId: string): GameState {
    return {
      ...this.state,
      players: this.state.players.map((p) => {
        if (p.id === playerId) return p;
        return {
          ...p,
          gold: 0,
          shop: [],
          streak: 0,
        } as PlayerState;
      }),
    };
  }

  sendLeakedMobToOpponent(fromPlayerId: string, leakedMob: MobInstance) {
    const opponents = this.state.players.filter(p => p.alive && p.id !== fromPlayerId);
    if (opponents.length === 0) return;

    const target = opponents[Math.floor(Math.random() * opponents.length)];
    const entry = this.map.entry;
    const newMob: MobInstance = {
      instanceId: nanoid(8),
      defId: leakedMob.defId,
      hp: leakedMob.hp,
      maxHp: leakedMob.maxHp,
      x: entry.col,
      y: entry.row - 0.5,
      pathIndex: 0,
      effects: [],
      visible: true,
    };

    if (!this.state.mobs[target.id]) {
      this.state.mobs[target.id] = [];
    }
    this.state.mobs[target.id].push(newMob);
  }

  sendTo(playerId: string, msg: ServerMsg) {
    const client = this.clients.get(playerId);
    if (client && client.ws.readyState === client.ws.OPEN) {
      client.ws.send(JSON.stringify(msg));
    }
  }

  // ── Phase Management ────────────────────────────────

  startNextRound() {
    this.state.round++;
    if (this.state.round > TOTAL_ROUNDS) {
      this.endGame();
      return;
    }

    // Check if this round should have augment pick
    if (isAugmentRound(this.state.round)) {
      this.startAugmentPick();
    } else {
      this.startShopPhase();
    }
  }

  startAugmentPick() {
    this.state.phase = 'augmentPick';
    this.augmentPicked.clear();

    // Generate 3 choices per player
    const augmentChoices: Record<string, string[]> = {};
    this.state.players.filter(p => p.alive).forEach(p => {
      const choices = generateAugmentChoices(this.state.round, p.augments);
      augmentChoices[p.id] = choices.map(a => a.id);
      
      // Send choices to this player
      this.sendTo(p.id, {
        type: 'AUGMENT_CHOICES',
        choices: choices.map(a => ({
          id: a.id,
          name: a.name,
          description: a.description,
          icon: a.icon,
          tier: a.tier,
        })),
      });
    });
    this.state.augmentChoices = augmentChoices;

    this.state.timer = AUGMENT_PICK_DURATION;
    this.broadcast({
      type: 'PHASE_CHANGE',
      phase: 'augmentPick',
      round: this.state.round,
      timer: AUGMENT_PICK_DURATION,
    });

    if (this.phaseTimer) { clearInterval(this.phaseTimer); this.phaseTimer = null; }
    this.phaseTimer = setInterval(() => {
      this.state.timer -= this.speed;
      if (this.state.timer <= 0) {
        this.state.timer = 0;
        clearInterval(this.phaseTimer!);
        this.phaseTimer = null;
        
        // Auto-pick for players who didn't choose
        this.state.players.filter(p => p.alive && !this.augmentPicked.has(p.id)).forEach(p => {
          const choices = this.state.augmentChoices?.[p.id] || [];
          if (choices.length > 0) {
            const randomPick = choices[Math.floor(Math.random() * choices.length)];
            p.augments.push(randomPick);
            this.broadcast({ type: 'AUGMENT_PICKED', playerId: p.id, augmentId: randomPick });
          }
        });
        
        this.startShopPhase();
      }
    }, 1000);
  }

  startShopPhase() {
    this.state.phase = 'shopping';
    this.state.augmentChoices = undefined;
    const duration = this.state.round === 1 ? FIRST_SHOP_PHASE_DURATION : SHOP_PHASE_DURATION;
    this.state.timer = duration;

    // Generate shops
    this.state.players.filter((p) => p.alive).forEach((p) => {
      p.shop = this.shop.generateShop(p);
    });

    this.broadcast({
      type: 'PHASE_CHANGE',
      phase: 'shopping',
      round: this.state.round,
      timer: duration,
    });
    this.broadcastStateUpdate();

    if (this.phaseTimer) { clearInterval(this.phaseTimer); this.phaseTimer = null; }
    this.phaseTimer = setInterval(() => {
      this.state.timer -= this.speed;
      if (this.state.timer <= 0) {
        this.state.timer = 0;
        clearInterval(this.phaseTimer!);
        this.phaseTimer = null;
        this.startCombat();
      }
    }, 1000);
  }

  startCombat() {
    if (this.state.phase === 'gameOver') return;
    this.state.phase = 'combat';
    this.broadcast({
      type: 'PHASE_CHANGE',
      phase: 'combat',
      round: this.state.round,
      timer: 0,
    });

    // Spawn mobs for each alive player
    this.state.players.filter((p) => p.alive).forEach((p) => {
      this.state.mobs[p.id] = this.combat.spawnWave(this.state.round, p);
    });

    // PvP monster pits: send mobs to opponents
    this.state.players.filter(p => p.alive).forEach(p => {
      const pvpTowers = p.towers.filter(t => t.defId === 'pvp');
      if (pvpTowers.length === 0) return;

      const opponents = this.state.players.filter(op => op.alive && op.id !== p.id);
      if (opponents.length === 0) return;

      for (const pvpTower of pvpTowers) {
        const def = TOWER_MAP[pvpTower.defId];
        if (!def) continue;
        
        const mobPower = def.mobPower || 1.0;
        const starMult = pvpTower.stars >= 1 ? 2 : 1;
        const pvpMultiplier = p.augments.includes('PVP_BOOST') ? 1.25 : 1;
        const doubleCount = p.augments.includes('DOUBLE_SEND') ? 2 : 1;
        
        const hp = Math.floor(MOB_BASE_HP * Math.pow(1.10, this.state.round - 1) * mobPower * starMult * pvpMultiplier);
        const target = opponents[Math.floor(Math.random() * opponents.length)];
        
        for (let i = 0; i < doubleCount; i++) {
          const entry = this.map.entry;
          const newMob: MobInstance = {
            instanceId: nanoid(8),
            defId: 'tank', // PvP mobs are tanky
            hp,
            maxHp: hp,
            x: entry.col,
            y: entry.row - 0.3 * i,
            pathIndex: 0,
            effects: [],
            visible: true,
          };
          if (!this.state.mobs[target.id]) this.state.mobs[target.id] = [];
          this.state.mobs[target.id].push(newMob);
        }
      }
    });

    this.broadcastStateUpdate();

    this.roundLeaks.clear();
    this.state.players.filter((p) => p.alive).forEach((p) => {
      this.roundLeaks.set(p.id, 0);
    });

    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    this.tickCount = 0;
    this.tickInterval = setInterval(() => {
      for (let i = 0; i < this.speed; i++) {
        if (this.state.phase !== 'combat') break;
        this.tick();
      }
    }, TICK_MS);
  }

  tick() {
    if (this.state.phase === 'gameOver') return;
    this.tickCount++;

    this.state.players.filter((p) => p.alive).forEach((p) => {
      const result = this.combat.tick(p, this.state.mobs[p.id], TICK_MS);

      result.killed.forEach(() => {
        const goldReward = this.economy.mobKillReward(this.state.round);
        p.gold += goldReward;
      });

      result.leaked.forEach((mob) => {
        const damage = mob.hp > 0 ? Math.ceil(mob.hp / mob.maxHp * 3) + 1 : 1;
        p.hp = Math.max(0, p.hp - damage);
        this.roundLeaks.set(p.id, (this.roundLeaks.get(p.id) || 0) + 1);

        this.broadcast({
          type: 'MOB_LEAKED',
          playerId: p.id,
          mobId: mob.instanceId,
          damage,
          sentTo: '',
        });

        this.sendLeakedMobToOpponent(p.id, mob);
      });

      if (result.attacks.length > 0 || result.killed.length > 0 || result.leaked.length > 0) {
        this.broadcast({
          type: 'COMBAT_EVENTS',
          playerId: p.id,
          attacks: result.attacks.map((a) => ({
            towerX: a.towerX,
            towerY: a.towerY,
            targetX: a.targetX,
            targetY: a.targetY,
            damage: a.damage,
            element: a.element,
            splash: a.splash,
          })),
          kills: result.killed.map((m) => ({
            mobId: m.instanceId,
            x: m.x,
            y: m.y,
            gold: this.economy.mobKillReward(this.state.round),
          })),
          leaks: result.leaked.map((m) => m.instanceId),
        });
      }

      this.state.mobs[p.id] = result.remaining;
    });

    if (this.tickCount % MOB_SYNC_INTERVAL === 0) {
      this.broadcast({ type: 'MOB_SYNC', mobs: this.state.mobs });
    }

    if (this.tickCount % 10 === 0) {
      this.broadcastStateUpdate();
    }

    this.state.players.forEach((p) => {
      if (p.alive && p.hp <= 0) {
        p.alive = false;
        this.broadcast({ type: 'PLAYER_ELIMINATED', playerId: p.id });
      }
    });

    const alivePlayers = this.state.players.filter((p) => p.alive);
    if (alivePlayers.length === 0 ||
        (this.state.players.length > 1 && alivePlayers.length <= 1)) {
      clearInterval(this.tickInterval!);
      this.endGame();
      return;
    }

    const allMobsDone = this.state.players
      .filter((p) => p.alive)
      .every((p) => this.state.mobs[p.id].length === 0);

    if (allMobsDone) {
      clearInterval(this.tickInterval!);
      this.endRound();
    }
  }

  endRound() {
    if (this.state.phase === 'gameOver') return;
    this.state.players.filter((p) => p.alive).forEach((p) => {
      const leakCount = this.roundLeaks.get(p.id) || 0;
      this.economy.endOfRoundIncome(p, leakCount === 0);
    });

    this.broadcastStateUpdate();
    this.startNextRound();
  }

  endGame() {
    if (this.state.phase === 'gameOver') return;
    this.state.phase = 'gameOver';
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    if (this.phaseTimer) { clearInterval(this.phaseTimer); this.phaseTimer = null; }

    const alive = this.state.players.filter((p) => p.alive);
    const winner = alive.length > 0
      ? alive.reduce((a, b) => (a.hp >= b.hp ? a : b))
      : this.state.players[0];

    this.state.winner = winner.id;
    this.broadcast({ type: 'GAME_OVER', winnerId: winner.id });

    this.clients.forEach((_client, playerId) => {
      playerToGame.delete(playerId);
    });

    const roomCode = [...this.clients.values()][0]?.roomCode;
    if (roomCode) {
      setTimeout(() => {
        activeGames.delete(roomCode);
        rooms.delete(roomCode);
        this.clients.forEach((client) => {
          client.roomCode = null;
        });
        console.log(`[cleanup] Removed game + room ${roomCode}`);
      }, 500);
    }
  }
}

// ── Factory ─────────────────────────────────────────────

const activeGames = new Map<string, Game>();
const playerToGame = new Map<string, Game>();

export function getGameForPlayer(playerId: string): Game | undefined {
  return playerToGame.get(playerId);
}

export function createGame(clients: Client[], names: Map<string, string>, config?: GameConfig) {
  const game = new Game(clients, names, config);
  if (clients[0].roomCode) {
    activeGames.set(clients[0].roomCode, game);
  }
  clients.forEach((c) => playerToGame.set(c.id, game));

  clients.forEach((c) => {
    game.sendTo(c.id, { type: 'YOUR_ID', id: c.id });
    game.sendTo(c.id, { type: 'GAME_START', state: game.state, mapDef: game.map });
  });

  setTimeout(() => game.start(), 200);
}

// Import MOB_BASE_HP for PvP calculations
import { MOB_BASE_HP } from '@ect/shared';
