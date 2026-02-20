import { nanoid } from 'nanoid';
import type { Client } from './index.js';
import type {
  GameState,
  PlayerState,
  ServerMsg,
  ClientMsg,
  GameMap,
  MobInstance,
  TowerInstance,
  Element,
  PlayerColor,
  GridPos,
} from '@ect/shared';
import {
  STARTING_HP,
  STARTING_GOLD,
  STARTING_LEVEL,
  XP_REQUIREMENTS,
  SHOP_SLOTS,
  BENCH_SIZE,
  PLAYER_COLORS,
  ALL_MAPS,
  ELEMENTS,
  TOTAL_ROUNDS,
  SHOP_PHASE_DURATION,
  FIRST_SHOP_PHASE_DURATION,
  TICK_MS,
  MOB_SYNC_INTERVAL,
  TOWER_MAP,
  isPathCell,
  HEX_MAP,
} from '@ect/shared';
import { ShopManager } from './shop.js';
import { CombatManager } from './combat.js';
import { EconomyManager } from './economy.js';

export class Game {
  state: GameState;
  map: GameMap;
  clients: Map<string, Client>; // playerId → client
  names: Map<string, string>;
  shop: ShopManager;
  combat: CombatManager;
  economy: EconomyManager;
  tickInterval: ReturnType<typeof setInterval> | null = null;
  phaseTimer: ReturnType<typeof setInterval> | null = null;
  tickCount = 0;

  constructor(clients: Client[], names: Map<string, string>) {
    // Pick random map
    this.map = ALL_MAPS[Math.floor(Math.random() * ALL_MAPS.length)];

    // Build client lookup
    this.clients = new Map();
    this.names = names;
    const playerIds: string[] = [];

    clients.forEach((c, i) => {
      this.clients.set(c.id, c);
      playerIds.push(c.id);
    });

    // Init player states
    const players: PlayerState[] = playerIds.map((id, i) => ({
      id,
      name: names.get(id) || `Player ${i + 1}`,
      color: PLAYER_COLORS[i] as PlayerColor,
      hp: STARTING_HP,
      gold: STARTING_GOLD,
      level: STARTING_LEVEL,
      xp: 0,
      xpToNext: XP_REQUIREMENTS[2],
      towers: [],
      bench: [],
      shop: Array(SHOP_SLOTS).fill(null),
      synergies: Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>,
      streak: 0,
      alive: true,
      incomingHex: null,
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

    // Start the game
    this.startNextRound();
  }

  // ── Player Actions ──────────────────────────────────

  handlePlayerAction(playerId: string, msg: ClientMsg) {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || !player.alive) return;

    switch (msg.type) {
      case 'BUY_TOWER': {
        if (this.state.phase !== 'shopping') return;
        if (this.shop.buyTower(player, msg.shopIndex)) {
          this.updateSynergies(player);
          this.sendTo(playerId, { type: 'SHOP_UPDATE', shop: player.shop, gold: player.gold });
          this.broadcast({ type: 'STATE_UPDATE', state: this.state });
        }
        break;
      }
      case 'PLACE_TOWER': {
        if (this.state.phase !== 'shopping') return;
        if (msg.benchIndex < 0 || msg.benchIndex >= player.bench.length) return;
        const defId = player.bench[msg.benchIndex];
        if (!defId) return;
        // Validate position
        if (isPathCell(this.map, msg.position)) return;
        if (msg.position.row < 0 || msg.position.row >= 8 || msg.position.col < 0 || msg.position.col >= 8) return;
        if (player.towers.some((t) => t.position.row === msg.position.row && t.position.col === msg.position.col)) return;

        const def = TOWER_MAP[defId];
        if (!def) return;

        // Check for fusion (3 copies of same tower)
        const sameTowers = player.towers.filter((t) => t.defId === defId && t.starLevel === 0);
        const sameBench = player.bench.filter((b) => b === defId);

        if (sameTowers.length >= 2 && sameBench.length >= 1) {
          // Fuse! Remove 2 placed towers, remove from bench, create ★ version
          const toRemove = sameTowers.slice(0, 2);
          player.towers = player.towers.filter((t) => !toRemove.includes(t));
          player.bench.splice(msg.benchIndex, 1);

          const fused: TowerInstance = {
            instanceId: nanoid(8),
            defId,
            position: msg.position,
            starLevel: 1,
            elements: [...def.elements],
          };
          player.towers.push(fused);
        } else {
          // Normal placement
          player.bench.splice(msg.benchIndex, 1);
          const tower: TowerInstance = {
            instanceId: nanoid(8),
            defId,
            position: msg.position,
            starLevel: 0,
            elements: [...def.elements],
          };
          player.towers.push(tower);
        }

        this.updateSynergies(player);
        this.broadcast({ type: 'STATE_UPDATE', state: this.state });
        break;
      }
      case 'MOVE_TOWER': {
        if (this.state.phase !== 'shopping') return;
        const tower = player.towers.find((t) => t.instanceId === msg.instanceId);
        if (!tower) return;
        if (isPathCell(this.map, msg.position)) return;
        if (player.towers.some((t) => t.instanceId !== msg.instanceId && t.position.row === msg.position.row && t.position.col === msg.position.col)) return;
        tower.position = msg.position;
        this.broadcast({ type: 'STATE_UPDATE', state: this.state });
        break;
      }
      case 'SELL_TOWER': {
        if (this.state.phase !== 'shopping') return;
        if (this.shop.sellTower(player, msg.instanceId)) {
          this.updateSynergies(player);
          this.broadcast({ type: 'STATE_UPDATE', state: this.state });
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
      case 'LEVEL_UP': {
        if (this.state.phase !== 'shopping') return;
        if (this.shop.levelUp(player)) {
          this.broadcast({ type: 'STATE_UPDATE', state: this.state });
        }
        break;
      }
      case 'CAST_HEX': {
        if (this.state.phase !== 'shopping') return;
        const hex = HEX_MAP[msg.hexId];
        if (!hex) return;
        if (player.gold < hex.cost) return;
        const target = this.state.players.find((p) => p.id === msg.targetPlayerId && p.alive);
        if (!target || target.id === playerId) return;
        player.gold -= hex.cost;
        target.incomingHex = { hexId: msg.hexId, fromPlayerId: playerId, toPlayerId: target.id };
        this.broadcast({ type: 'HEX_INCOMING', hex: target.incomingHex });
        this.broadcast({ type: 'STATE_UPDATE', state: this.state });
        break;
      }
    }
  }

  private updateSynergies(player: PlayerState) {
    // Reset
    for (const e of ELEMENTS) {
      player.synergies[e] = 0;
    }
    // Count elements from placed towers
    for (const tower of player.towers) {
      for (const elem of tower.elements) {
        player.synergies[elem]++;
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

    this.state.phase = 'shopping';
    const duration = this.state.round === 1 ? FIRST_SHOP_PHASE_DURATION : SHOP_PHASE_DURATION;
    this.state.timer = duration;

    // Generate shops for all alive players
    this.state.players.filter((p) => p.alive).forEach((p) => {
      p.shop = this.shop.generateShop(p);
    });

    // Grant passive XP
    if (this.state.round > 1) {
      this.economy.grantPassiveXp();
    }

    this.broadcast({
      type: 'PHASE_CHANGE',
      phase: 'shopping',
      round: this.state.round,
      timer: duration,
    });
    this.broadcast({ type: 'STATE_UPDATE', state: this.state });

    // Countdown timer
    this.phaseTimer = setInterval(() => {
      this.state.timer--;
      if (this.state.timer <= 0) {
        clearInterval(this.phaseTimer!);
        this.startCombat();
      }
    }, 1000);

    // Also stagger mob spawns so they don't all overlap
    // (handled in spawnWave with delay offsets)
  }

  startCombat() {
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

    this.broadcast({ type: 'STATE_UPDATE', state: this.state });

    // Start tick loop
    this.tickCount = 0;
    this.tickInterval = setInterval(() => this.tick(), TICK_MS);
  }

  tick() {
    this.tickCount++;
    const events: ServerMsg[] = [];

    // Update each alive player's mobs
    this.state.players.filter((p) => p.alive).forEach((p) => {
      const result = this.combat.tick(p, this.state.mobs[p.id], TICK_MS);

      // Handle kills
      result.killed.forEach((mob) => {
        const goldReward = this.economy.mobKillReward(this.state.round);
        p.gold += goldReward;
        events.push({ type: 'MOB_KILLED', playerId: p.id, mobId: mob.instanceId, goldReward });
      });

      // Handle leaks
      result.leaked.forEach((mob) => {
        const damage = mob.hp > 0 ? Math.ceil(mob.hp / mob.maxHp * 3) + 1 : 1;
        p.hp = Math.max(0, p.hp - damage);
        
        // Send leaked mob to random other alive player
        const others = this.state.players.filter((o) => o.alive && o.id !== p.id);
        const target = others.length > 0 ? others[Math.floor(Math.random() * others.length)] : null;
        
        events.push({
          type: 'MOB_LEAKED',
          playerId: p.id,
          mobId: mob.instanceId,
          damage,
          sentTo: target?.id || '',
        });

        // TODO: actually add leaked mob to target's board
      });

      // Update mob list (remove dead/leaked)
      this.state.mobs[p.id] = result.remaining;
    });

    // Broadcast events
    events.forEach((e) => this.broadcast(e));

    // Sync mob positions periodically
    if (this.tickCount % MOB_SYNC_INTERVAL === 0) {
      this.broadcast({ type: 'MOB_SYNC', mobs: this.state.mobs });
    }

    // Check eliminations
    this.state.players.forEach((p) => {
      if (p.alive && p.hp <= 0) {
        p.alive = false;
        this.broadcast({ type: 'PLAYER_ELIMINATED', playerId: p.id });
      }
    });

    // Check if combat is over (all mobs resolved)
    const allMobsDone = this.state.players
      .filter((p) => p.alive)
      .every((p) => this.state.mobs[p.id].length === 0);

    // Check if game over (1 or 0 alive)
    const alivePlayers = this.state.players.filter((p) => p.alive);
    if (alivePlayers.length <= 1) {
      clearInterval(this.tickInterval!);
      this.endGame();
      return;
    }

    if (allMobsDone) {
      clearInterval(this.tickInterval!);
      this.endRound();
    }
  }

  endRound() {
    // Calculate income
    this.state.players.filter((p) => p.alive).forEach((p) => {
      const leaked = false; // TODO: track per-round leaks
      this.economy.endOfRoundIncome(p, !leaked);
    });

    this.broadcast({ type: 'STATE_UPDATE', state: this.state });
    this.startNextRound();
  }

  endGame() {
    this.state.phase = 'gameOver';
    const alive = this.state.players.filter((p) => p.alive);
    const winner = alive.length > 0
      ? alive.reduce((a, b) => (a.hp >= b.hp ? a : b))
      : this.state.players[0]; // fallback

    this.state.winner = winner.id;
    this.broadcast({ type: 'GAME_OVER', winnerId: winner.id });
  }
}

// ── Factory ─────────────────────────────────────────────

const activeGames = new Map<string, Game>();
const playerToGame = new Map<string, Game>();

export function getGameForPlayer(playerId: string): Game | undefined {
  return playerToGame.get(playerId);
}

export function createGame(clients: Client[], names: Map<string, string>) {
  const game = new Game(clients, names);
  // Store by first player's room code for lookup
  if (clients[0].roomCode) {
    activeGames.set(clients[0].roomCode, game);
  }
  // Map each player to this game
  clients.forEach((c) => playerToGame.set(c.id, game));

  // Send game start to each player with their ID
  clients.forEach((c) => {
    game.sendTo(c.id, {
      type: 'GAME_START',
      state: game.state,
      mapDef: game.map,
    });
  });
}
