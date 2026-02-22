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
  PvPQueueEntry,
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
  randomElement,
  getActiveCombo,
  findCombo,
  COMBO_MAP,
  PVP_UNIT_DEFS,
  MOB_BASE_HP,
  MOB_HP_SCALE,
} from '@ect/shared';
import type { Element } from '@ect/shared';
import type { TowerTier } from '@ect/shared';
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
  firstKillClaimed: boolean = false;
  speed: number = 1;
  config: GameConfig;
  /** Track which players have picked augments this round */
  augmentPicked: Set<string> = new Set();
  /** PvP unit queues per player (Feature 4) */
  pvpQueues: Map<string, PvPQueueEntry[]> = new Map();

  constructor(clients: Client[], names: Map<string, string>, colors: Map<string, PlayerColor>, config: GameConfig = DEFAULT_GAME_CONFIG) {
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
      color: colors.get(id) || PLAYER_COLORS[i] as PlayerColor, // Use chosen color or fallback to index-based
      hp: config.startingHp,
      gold: config.startingGold,
      towers: [],
      shop: Array(SHOP_SLOTS).fill(null),
      augments: [],
      elements: [],
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

        // Towers are placed neutral — player applies elements manually
        const tower: TowerInstance = {
          instanceId: nanoid(8),
          defId: itemId,
          position: msg.position,
          stars: 1,
        };
        player.towers.push(tower);
        player.gold -= cost;
        player.shop[msg.shopIndex] = null;

        // Try fusion (legacy, now no-op) and update upgrade indicators
        this.shop.tryFusion(player, itemId);
        this.shop.updateCanUpgrade(player);

        this.sendTo(playerId, { type: 'SHOP_UPDATE', shop: player.shop, gold: player.gold });
        this.broadcastStateUpdate();
        break;
      }
      case 'SELL_TOWER': {
        
        if (this.shop.sellTower(player, msg.instanceId)) {
          this.broadcastStateUpdate();
        }
        break;
      }
      case 'REROLL': {
        
        if (this.shop.reroll(player)) {
          this.sendTo(playerId, { type: 'SHOP_UPDATE', shop: player.shop, gold: player.gold });
        }
        break;
      }
      case 'UPGRADE_TOWER': {
        if (this.shop.upgradeTower(player, msg.towerId)) {
          const tower = player.towers.find(t => t.instanceId === msg.towerId);
          if (tower) {
            this.broadcast({ type: 'TOWER_UPGRADED', playerId, towerId: msg.towerId, newTier: tower.stars });
          }
          this.sendTo(playerId, { type: 'SHOP_UPDATE', shop: player.shop, gold: player.gold });
          this.broadcastStateUpdate();
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
        
        // Track element picks — unlocks the element for the player (no auto-apply to towers)
        const pickedAug = AUGMENT_POOL.find(a => a.id === msg.augmentId);
        if (pickedAug && pickedAug.effect.type === 'element') {
          player.elements.push(pickedAug.effect.element);
          
          // Check for combo unlock (notify client for display)
          const combo = getActiveCombo(player.elements);
          if (combo && player.activeCombo !== combo.id) {
            player.activeCombo = combo.id;
            this.broadcast({ type: 'COMBO_UNLOCKED', playerId, comboId: combo.id, comboName: combo.name, comboColor: combo.color });
          }
        }
        
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
      case 'APPLY_ELEMENT': {
        // Apply an unlocked element or combo to a specific tower
        const tower = player.towers.find(t => t.instanceId === msg.towerId);
        if (!tower) return;
        const towerDef = TOWER_MAP[tower.defId];
        if (!towerDef || (towerDef.towerType !== 'arrow' && towerDef.towerType !== 'cannon')) return;

        if (msg.comboId) {
          // Applying a combo
          const combo = COMBO_MAP[msg.comboId];
          if (!combo) return;
          // Player must have both elements unlocked
          if (!player.elements.includes(combo.elements[0]) || !player.elements.includes(combo.elements[1])) return;
          tower.element = combo.elements[0]; // primary element for damage calc
          tower.combo = combo.id;
          this.broadcast({ type: 'ELEMENT_APPLIED', playerId, towerId: msg.towerId, comboId: combo.id });
        } else if (msg.element) {
          // Applying a single element
          if (!player.elements.includes(msg.element)) return;
          tower.element = msg.element;
          tower.combo = undefined;
          this.broadcast({ type: 'ELEMENT_APPLIED', playerId, towerId: msg.towerId, element: msg.element });
        } else {
          // Remove element (set to neutral)
          tower.element = undefined;
          tower.combo = undefined;
          this.broadcast({ type: 'ELEMENT_APPLIED', playerId, towerId: msg.towerId });
        }
        this.broadcastStateUpdate();
        break;
      }
      case 'QUEUE_PVP_UNIT': {
        // Feature 4: PvP unit queueing
        
        const unitDef = PVP_UNIT_DEFS[msg.unitType as keyof typeof PVP_UNIT_DEFS];
        if (!unitDef) return;
        
        // Validate target player exists and is alive
        const targetPlayer = this.state.players.find(p => p.id === msg.targetPlayerId && p.alive);
        if (!targetPlayer || targetPlayer.id === playerId) return;
        
        // Check if player has enough gold
        if (player.gold < unitDef.cost) return;
        
        // Deduct cost and add to queue
        player.gold -= unitDef.cost;
        
        if (!this.pvpQueues.has(playerId)) {
          this.pvpQueues.set(playerId, []);
        }
        const queue = this.pvpQueues.get(playerId)!;
        queue.push({ unitType: msg.unitType, targetPlayerId: msg.targetPlayerId });
        
        // Send queue update to sender
        this.sendTo(playerId, { type: 'PVP_QUEUE_UPDATE', queue: [...queue] });
        this.sendTo(playerId, { type: 'SHOP_UPDATE', shop: player.shop, gold: player.gold });
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

  // Feature 2: Broadcast next wave information
  broadcastNextWaveInfo() {
    const nextRound = this.state.round + 1;
    if (nextRound > TOTAL_ROUNDS) return;

    const isBoss = [5, 10, 15, 20, 25, 30].includes(nextRound);
    const baseHp = Math.floor(MOB_BASE_HP * Math.pow(MOB_HP_SCALE, nextRound - 1));
    const baseCount = Math.floor(5 + 0.4 * nextRound);

    let mobType: string;
    let count: number;
    let hp: number;

    if (isBoss) {
      mobType = 'boss';
      count = nextRound >= 20 ? 2 : 1;
      hp = Math.floor(baseHp * 5); // BOSS_HP_MULT
    } else {
      const isSwarmRound = nextRound % 3 === 0;
      const isRunnerRound = !isSwarmRound && nextRound % 2 === 0;

      if (isSwarmRound) {
        mobType = 'swarm';
        count = Math.floor(baseCount * 2.5);
        hp = Math.floor(baseHp * 0.4);
      } else if (isRunnerRound) {
        mobType = 'runner';
        count = baseCount;
        hp = Math.floor(baseHp * 0.6);
      } else {
        mobType = 'tank';
        count = Math.max(2, Math.floor(baseCount * 0.6));
        hp = Math.floor(baseHp * 2.2);
      }
    }

    const element = nextRound >= 3 ? randomElement() : undefined;

    this.broadcast({
      type: 'NEXT_WAVE_INFO',
      mobType,
      element,
      count,
      hp,
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
      element: leakedMob.element,
      armor: 0,
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
            // Track element for auto-picks too (no auto-apply to towers)
            const aug = AUGMENT_POOL.find(a => a.id === randomPick);
            if (aug && aug.effect.type === 'element') {
              p.elements.push(aug.effect.element);
              const combo = getActiveCombo(p.elements);
              if (combo && p.activeCombo !== combo.id) {
                p.activeCombo = combo.id;
                this.broadcast({ type: 'COMBO_UNLOCKED', playerId: p.id, comboId: combo.id, comboName: combo.name, comboColor: combo.color });
              }
            }
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

    // Feature 2: Broadcast next wave info
    this.broadcastNextWaveInfo();

    // Generate shops and compute upgrade indicators
    this.state.players.filter((p) => p.alive).forEach((p) => {
      p.shop = this.shop.generateShop(p);
      this.shop.updateCanUpgrade(p);
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

    // Feature 4: Spawn PvP units from queue
    this.state.players.filter(p => p.alive).forEach(p => {
      const queue = this.pvpQueues.get(p.id) || [];
      let delay = 1.5; // Start spawning 1.5 seconds after regular wave
      
      for (const entry of queue) {
        const unitDef = PVP_UNIT_DEFS[entry.unitType as keyof typeof PVP_UNIT_DEFS];
        if (!unitDef) continue;
        
        const targetPlayer = this.state.players.find(tp => tp.id === entry.targetPlayerId && tp.alive);
        if (!targetPlayer) continue;
        
        const hp = Math.floor(MOB_BASE_HP * Math.pow(MOB_HP_SCALE, this.state.round - 1) * unitDef.hp_mult);
        const mapEntry = this.map.entry;
        
        const newMob: MobInstance = {
          instanceId: nanoid(8),
          defId: entry.unitType.replace('pvp_', ''), // pvp_grunt -> grunt, etc.
          hp,
          maxHp: hp,
          x: mapEntry.col,
          y: mapEntry.row - delay,
          pathIndex: 0,
          effects: [],
          visible: true,
          element: this.state.round >= 3 ? randomElement() : undefined,
          armor: 0,
        };
        
        if (!this.state.mobs[targetPlayer.id]) {
          this.state.mobs[targetPlayer.id] = [];
        }
        this.state.mobs[targetPlayer.id].push(newMob);
        
        delay += 0.5; // Stagger PvP units
      }
      
      // Clear queue after spawning
      this.pvpQueues.set(p.id, []);
      this.sendTo(p.id, { type: 'PVP_QUEUE_UPDATE', queue: [] });
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
        const starMult = pvpTower.stars >= 3 ? 3 : pvpTower.stars >= 2 ? 2 : 1;
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
            element: this.state.round >= 3 ? randomElement() : undefined,
            armor: 0,
          };
          if (!this.state.mobs[target.id]) this.state.mobs[target.id] = [];
          this.state.mobs[target.id].push(newMob);
        }
      }
    });

    this.broadcastStateUpdate();

    this.roundLeaks.clear();
    this.firstKillClaimed = false;
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

      let gotFirstKill = false;
      result.killed.forEach(() => {
        // First kill of the round across ALL players = +2g
        if (!this.firstKillClaimed) {
          this.firstKillClaimed = true;
          gotFirstKill = true;
          p.gold += 2;
        }
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
          kills: result.killed.map((m, i) => ({
            mobId: m.instanceId,
            x: m.x,
            y: m.y,
            gold: (i === 0 && gotFirstKill) ? 2 : 0,
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

export function createGame(clients: Client[], names: Map<string, string>, colors: Map<string, PlayerColor>, config?: GameConfig) {
  const game = new Game(clients, names, colors, config);
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
