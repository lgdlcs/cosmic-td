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
  Element,
  PlayerColor,
  GridPos,
} from '@ect/shared';
import {
  DEFAULT_GAME_CONFIG,
  STARTING_LEVEL,
  GRID_SIZE,
  SHOP_SLOTS,
  PLAYER_COLORS,
  ALL_MAPS,
  ELEMENTS,
  TOTAL_ROUNDS,
  SHOP_PHASE_DURATION,
  FIRST_SHOP_PHASE_DURATION,
  TICK_MS,
  MOB_SYNC_INTERVAL,
  TOWER_MAP,
  BASE_TOWER_COSTS,
  UPGRADE_COST_T1,
  UPGRADE_COST_T2,
  UPGRADE_COST_T3,
  UPGRADE_POINTS_REQUIRED_T3,
  isPathCell,
  HEX_MAP,
  canUpgradeTower,
  getUpgradeCost,
} from '@ect/shared';
import { ShopManager } from './shop.js';
import { CombatManager } from './combat.js';
import { EconomyManager } from './economy.js';
import { rooms } from './lobby.js';

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
  /** Track per-round leaks per player for clean bonus calculation */
  roundLeaks: Map<string, number> = new Map();
  /** Game speed multiplier */
  speed: number = 1;

  config: GameConfig;

  constructor(clients: Client[], names: Map<string, string>, config: GameConfig = DEFAULT_GAME_CONFIG) {
    this.config = config;
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
      hp: config.startingHp,
      gold: config.startingGold,
      level: STARTING_LEVEL,
      xp: 0,
      xpToNext: 0, // No longer used
      towers: [],
      fragments: Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>,
      totalBought: Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>,
      shop: Array(SHOP_SLOTS).fill(null),
      synergies: Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>, // For compatibility
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

    this.shop = new ShopManager(this.state, config.fragmentPoolSize);
    this.combat = new CombatManager(this.state, this.map);
    this.economy = new EconomyManager(this.state);
    // Don't start yet — wait for createGame to send GAME_START first
  }

  /** Called after GAME_START is sent to clients */
  start() {
    this.startNextRound();
  }

  // ── Player Actions ──────────────────────────────────

  handlePlayerAction(playerId: string, msg: ClientMsg) {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || !player.alive) return;

    switch (msg.type) {
      case 'BUY_AND_PLACE': {
        if (this.state.phase === 'gameOver' || this.state.phase === 'lobby') return;
        if (msg.shopIndex < 0 || msg.shopIndex >= SHOP_SLOTS) return;
        const itemId = player.shop[msg.shopIndex];
        if (!itemId) return;
        
        // Validate position
        if (isPathCell(this.map, msg.position)) return;
        if (msg.position.row < 0 || msg.position.row >= GRID_SIZE || msg.position.col < 0 || msg.position.col >= GRID_SIZE) return;
        if (player.towers.some((t) => t.position.row === msg.position.row && t.position.col === msg.position.col)) return;

        // Only handle base towers in BUY_AND_PLACE, fragments are handled in BUY_FRAGMENT
        // It's a base tower
        const def = TOWER_MAP[itemId];
        if (!def) return;
        
        const cost = BASE_TOWER_COSTS[def.id as keyof typeof BASE_TOWER_COSTS] || 3;
        if (player.gold < cost) return;

        // Create base tower with no applied elements
        const tower: TowerInstance = {
          instanceId: nanoid(8),
          defId: itemId,
          position: msg.position,
          appliedElements: [],
        };
        player.towers.push(tower);

        // Deduct cost and clear shop slot
        player.gold -= cost;
        player.shop[msg.shopIndex] = null;

        this.sendTo(playerId, { type: 'SHOP_UPDATE', shop: player.shop, gold: player.gold });
        this.broadcastStateUpdate();
        break;
      }
      case 'BUY_FRAGMENT': {
        if (this.state.phase === 'gameOver' || this.state.phase === 'lobby') return;
        if (this.shop.buyFragment(player, msg.shopIndex)) {
          this.sendTo(playerId, { type: 'SHOP_UPDATE', shop: player.shop, gold: player.gold });
          this.broadcastStateUpdate();
        }
        break;
      }
      case 'UPGRADE_TOWER': {
        if (this.state.phase === 'gameOver' || this.state.phase === 'lobby') return;
        const tower = player.towers.find((t) => t.instanceId === msg.instanceId);
        if (!tower) return;

        const check = canUpgradeTower(
          tower.appliedElements,
          msg.element,
          player.fragments,
          player.gold,
          player.totalBought
        );
        if (!check.canUpgrade) return;

        // Deduct cost and fragment
        player.gold -= check.cost;
        player.fragments[msg.element]--;
        tower.appliedElements.push(msg.element);

        this.broadcastStateUpdate();
        break;
      }
      case 'SELL_TOWER': {
        if (this.state.phase === 'gameOver' || this.state.phase === 'lobby') return;
        if (this.shop.sellTower(player, msg.instanceId)) {
          this.broadcastStateUpdate();
        }
        break;
      }
      case 'REROLL': {
        if (this.state.phase === 'gameOver' || this.state.phase === 'lobby') return;
        if (this.shop.reroll(player)) {
          this.sendTo(playerId, { type: 'SHOP_UPDATE', shop: player.shop, gold: player.gold });
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
      case 'CAST_HEX': {
        if (this.state.phase === 'gameOver' || this.state.phase === 'lobby') return;
        const hex = HEX_MAP[msg.hexId];
        if (!hex) return;
        if (player.gold < hex.cost) return;
        const target = this.state.players.find((p) => p.id === msg.targetPlayerId && p.alive);
        if (!target || target.id === playerId) return;
        player.gold -= hex.cost;
        target.incomingHex = { hexId: msg.hexId, fromPlayerId: playerId, toPlayerId: target.id };
        this.broadcast({ type: 'HEX_INCOMING', hex: target.incomingHex });
        this.broadcastStateUpdate();
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

  /** Broadcast state update with player-specific filtering */
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

  /** Get filtered game state for a specific player (hide sensitive opponent data) */
  getFilteredStateForPlayer(playerId: string): GameState {
    const filteredState: GameState = {
      ...this.state,
      players: this.state.players.map((p) => {
        if (p.id === playerId) {
          // Current player: full data
          return p;
        } else {
          // Opponents: hide sensitive data
          return {
            ...p,
            gold: 0, // Hide exact gold
            shop: [], // Hide shop contents
            bench: [], // Hide bench contents  
            synergies: { fire: 0, water: 0, earth: 0, wind: 0, light: 0, dark: 0 }, // Hide exact synergies
            streak: 0, // Hide streak
            xp: 0, // Hide exact XP
            xpToNext: 0,
            // Keep: hp, level, towers (count/elements only), alive status, color, name
          } as PlayerState;
        }
      }),
    };
    return filteredState;
  }

  /** Send leaked mob to a random opponent */
  sendLeakedMobToOpponent(fromPlayerId: string, leakedMob: MobInstance) {
    const opponents = this.state.players.filter(p => p.alive && p.id !== fromPlayerId);
    if (opponents.length === 0) return; // No valid targets

    // Choose random opponent (or implement targeting strategy)
    const target = opponents[Math.floor(Math.random() * opponents.length)];
    
    // Create new mob instance for target player with remaining HP
    const entry = this.map.entry;
    const newMob: MobInstance = {
      instanceId: nanoid(8),
      defId: leakedMob.defId,
      hp: leakedMob.hp,
      maxHp: leakedMob.maxHp,
      x: entry.col,
      y: entry.row - 0.5, // Small offset to avoid immediate overlap
      pathIndex: 0,
      effects: [], // Clear effects when transferring
      visible: true,
    };

    // Add to target's mob list
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

    this.state.phase = 'shopping';
    const duration = this.state.round === 1 ? FIRST_SHOP_PHASE_DURATION : SHOP_PHASE_DURATION;
    this.state.timer = duration;

    // Generate shops for all alive players
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

    // Clear any leftover timer
    if (this.phaseTimer) { clearInterval(this.phaseTimer); this.phaseTimer = null; }

    // Countdown timer (speed affects shopping timer too)
    this.phaseTimer = setInterval(() => {
      this.state.timer -= this.speed;
      if (this.state.timer <= 0) {
        this.state.timer = 0;
        clearInterval(this.phaseTimer!);
        this.phaseTimer = null;
        this.startCombat();
      }
    }, 1000);

    // Also stagger mob spawns so they don't all overlap
    // (handled in spawnWave with delay offsets)
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

    this.broadcastStateUpdate();

    // Reset per-round leak tracking
    this.roundLeaks.clear();
    this.state.players.filter((p) => p.alive).forEach((p) => {
      this.roundLeaks.set(p.id, 0);
    });

    // Clear any leftover tick loop
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }

    // Start tick loop
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

    // Update each alive player's mobs
    this.state.players.filter((p) => p.alive).forEach((p) => {
      const result = this.combat.tick(p, this.state.mobs[p.id], TICK_MS);

      // Handle kills
      result.killed.forEach((mob) => {
        const goldReward = this.economy.mobKillReward(this.state.round);
        p.gold += goldReward;
      });

      // Handle leaks - damage player and send mobs to opponents
      result.leaked.forEach((mob) => {
        const damage = mob.hp > 0 ? Math.ceil(mob.hp / mob.maxHp * 3) + 1 : 1;
        p.hp = Math.max(0, p.hp - damage);
        
        // Track leaks for clean bonus
        this.roundLeaks.set(p.id, (this.roundLeaks.get(p.id) || 0) + 1);
        
        // Notify leak with damage
        this.broadcast({
          type: 'MOB_LEAKED',
          playerId: p.id,
          mobId: mob.instanceId,
          damage,
          sentTo: '',
        });
        
        // Send leaked mob to a random opponent (multiplayer only)
        this.sendLeakedMobToOpponent(p.id, mob);
      });

      // Broadcast combat events (attacks, kills, leaks) in one message
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

      // Update mob list (remove dead/leaked)
      this.state.mobs[p.id] = result.remaining;
    });

    // Sync mob positions periodically
    if (this.tickCount % MOB_SYNC_INTERVAL === 0) {
      this.broadcast({ type: 'MOB_SYNC', mobs: this.state.mobs });
    }

    // Sync gold/HP periodically during combat (every 10 ticks = 500ms)
    if (this.tickCount % 10 === 0) {
      this.broadcastStateUpdate();
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

    // Check if game over
    const alivePlayers = this.state.players.filter((p) => p.alive);
    if (alivePlayers.length === 0) {
      // Everyone dead
      clearInterval(this.tickInterval!);
      this.endGame();
      return;
    }
    if (this.state.players.length > 1 && alivePlayers.length <= 1) {
      // Multiplayer: last one standing wins
      clearInterval(this.tickInterval!);
      this.endGame();
      return;
    }
    if (this.state.players.length === 1 && alivePlayers.length === 0) {
      // Solo: player died, game over
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
    if (this.state.phase === 'gameOver') return;
    // Calculate income
    this.state.players.filter((p) => p.alive).forEach((p) => {
      const leakCount = this.roundLeaks.get(p.id) || 0;
      this.economy.endOfRoundIncome(p, leakCount === 0);
    });

    this.broadcastStateUpdate();
    this.startNextRound();
  }

  endGame() {
    if (this.state.phase === 'gameOver') return; // prevent double-end
    this.state.phase = 'gameOver';
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    if (this.phaseTimer) { clearInterval(this.phaseTimer); this.phaseTimer = null; }

    const alive = this.state.players.filter((p) => p.alive);
    const winner = alive.length > 0
      ? alive.reduce((a, b) => (a.hp >= b.hp ? a : b))
      : this.state.players[0]; // fallback

    this.state.winner = winner.id;
    this.broadcast({ type: 'GAME_OVER', winnerId: winner.id });

    // Cleanup all mappings so players can rejoin lobby
    this.clients.forEach((client, playerId) => {
      playerToGame.delete(playerId);
    });

    const roomCode = [...this.clients.values()][0]?.roomCode;
    if (roomCode) {
      setTimeout(() => {
        activeGames.delete(roomCode);
        // Delete the room so players create a fresh one
        rooms.delete(roomCode);
        // Clear roomCode on clients so they don't try to rejoin stale room
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
  // Store by first player's room code for lookup
  if (clients[0].roomCode) {
    activeGames.set(clients[0].roomCode, game);
  }
  // Map each player to this game
  clients.forEach((c) => playerToGame.set(c.id, game));

  // Send game start to each player with their ID
  clients.forEach((c) => {
    // Ensure player knows their ID
    game.sendTo(c.id, {
      type: 'YOUR_ID',
      id: c.id,
    });
    game.sendTo(c.id, {
      type: 'GAME_START',
      state: game.state,
      mapDef: game.map,
    });
  });

  // Small delay to let clients set up before first phase
  setTimeout(() => game.start(), 200);
}
