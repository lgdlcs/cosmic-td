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
  BaseTowerInstance,
  ElementTowerInstance,
  PlayerColor,
  GridPos,
  BossRoundState,
} from '@ect/shared';
import type { Element } from '@ect/shared';
import {
  DEFAULT_GAME_CONFIG,
  GRID_SIZE,
  PLAYER_COLORS,
  ALL_MAPS,
  TOTAL_ROUNDS,
  PREP_PHASE_DURATION,
  FIRST_PREP_PHASE_DURATION,
  BOSS_SELECT_DURATION,
  BOSS_ROUND_INTERVAL,
  BOSS_DAMAGE_PER_PASS,
  TICK_MS,
  MOB_SYNC_INTERVAL,
  BASE_INCOME,
  KILL_REWARD,
  ELEMENT_CREDIT_VALUE,
  SELL_REFUND_RATIO,
  BASE_TOWER_MAP,
  ELEMENT_TOWER_MAP,
  ELEMENT_TOWER_DEFS,
  getElementUpgradeCost,
  getTowerSellPrice,
  isPathCell,
  ALL_ELEMENTS,
  PVP_UNIT_MAP,
  MOB_BASE_HP,
  MOB_HP_SCALE,
} from '@ect/shared';
import { PvPShopManager } from './shop.js';
import { CombatManager } from './combat.js';
import { EconomyManager } from './economy.js';
import { rooms } from './lobby.js';

function emptyElementInventory(): Record<Element, number> {
  const inv: Record<string, number> = {};
  for (const e of ALL_ELEMENTS) inv[e] = 0;
  return inv as Record<Element, number>;
}

function emptyBossState(): BossRoundState {
  return { active: false, passes: 0, damagePerPass: BOSS_DAMAGE_PER_PASS };
}

export class Game {
  state: GameState;
  map: GameMap;
  clients: Map<string, Client>;
  names: Map<string, string>;
  pvpShop: PvPShopManager;
  combat: CombatManager;
  economy: EconomyManager;
  tickInterval: ReturnType<typeof setInterval> | null = null;
  phaseTimer: ReturnType<typeof setInterval> | null = null;
  tickCount = 0;
  speed: number = 1;
  config: GameConfig;
  /** PvP units queued to send at start of next combat */
  pvpPending: { fromId: string; toId: string; unitId: string }[] = [];

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
      color: colors.get(id) || PLAYER_COLORS[i] as PlayerColor,
      hp: config.startingHp,
      credits: config.startingCredits,
      income: BASE_INCOME,
      towers: [],
      elementInventory: emptyElementInventory(),
      pureTowerSlot: null,
      alive: true,
      bossState: emptyBossState(),
    }));

    this.state = {
      phase: 'lobby',
      round: 0,
      timer: 0,
      players,
      mapId: this.map.id,
      mobs: Object.fromEntries(playerIds.map((id) => [id, []])),
      winner: null,
      isBossRound: false,
    };

    this.pvpShop = new PvPShopManager();
    this.combat = new CombatManager(this.state, this.map);
    this.economy = new EconomyManager();
  }

  start() {
    this.startNextRound();
  }

  // ── Player Actions ──────────────────────────────────

  handlePlayerAction(playerId: string, msg: ClientMsg) {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || !player.alive) return;

    switch (msg.type) {
      case 'BUY_BASE_TOWER': {
        if (this.state.phase !== 'prep') return;
        const def = BASE_TOWER_MAP[msg.towerType];
        if (!def) return;
        if (!this.isValidPlacement(player, msg.position)) return;
        if (player.credits < def.cost) return;

        const tower: BaseTowerInstance = {
          instanceId: nanoid(8),
          kind: 'base',
          towerType: msg.towerType,
          position: msg.position,
          tier: 1,
          totalInvested: def.cost,
        };
        player.credits -= def.cost;
        player.towers.push(tower);
        this.broadcast({ type: 'TOWER_PLACED', playerId, tower });
        this.broadcastStateUpdate();
        break;
      }

      case 'UPGRADE_BASE_TOWER': {
        if (this.state.phase !== 'prep') return;
        const tower = player.towers.find(t => t.instanceId === msg.towerId);
        if (!tower || tower.kind !== 'base') return;
        const baseTower = tower as BaseTowerInstance;
        if (baseTower.tier >= 3) return;

        const def = BASE_TOWER_MAP[baseTower.towerType];
        if (!def) return;
        const upgradeCost = def.upgradeCosts[baseTower.tier - 1];
        if (player.credits < upgradeCost) return;

        player.credits -= upgradeCost;
        baseTower.tier = (baseTower.tier + 1) as 1 | 2 | 3;
        baseTower.totalInvested += upgradeCost;
        this.broadcast({ type: 'TOWER_UPGRADED', playerId, towerId: msg.towerId });
        this.broadcastStateUpdate();
        break;
      }

      case 'APPLY_T3_ELEMENT': {
        if (this.state.phase !== 'prep') return;
        const tower = player.towers.find(t => t.instanceId === msg.towerId);
        if (!tower || tower.kind !== 'base') return;
        const baseTower = tower as BaseTowerInstance;
        if (baseTower.tier !== 3) return;
        if (baseTower.t3PlusElement) return; // already has element

        // Spend 1 element from inventory
        if ((player.elementInventory[msg.element] || 0) < 1) return;
        player.elementInventory[msg.element]--;
        baseTower.t3PlusElement = msg.element;
        baseTower.totalInvested += ELEMENT_CREDIT_VALUE;
        this.broadcastStateUpdate();
        break;
      }

      case 'BUY_ELEMENT_TOWER': {
        if (this.state.phase !== 'prep') return;
        if (!this.isValidPlacement(player, msg.position)) return;

        // Find matching element tower def
        const sortedElems = [...msg.elements].sort();
        let etDef = null;
        for (const def of ELEMENT_TOWER_DEFS) {
          const defElems = [...def.elements].sort();
          if (defElems.length === sortedElems.length && defElems.every((e, i) => e === sortedElems[i])) {
            etDef = def;
            break;
          }
        }
        if (!etDef) return;

        // Check element inventory
        const cost = etDef.rank1Cost;
        for (const [elem, qty] of Object.entries(cost)) {
          if ((player.elementInventory[elem as Element] || 0) < qty) return;
        }

        // Spend elements
        for (const [elem, qty] of Object.entries(cost)) {
          player.elementInventory[elem as Element] -= qty;
        }

        const tower: ElementTowerInstance = {
          instanceId: nanoid(8),
          kind: 'element',
          elementTowerId: etDef.id,
          position: msg.position,
          rank: 1,
          elements: [...msg.elements],
          isPure: false,
          totalInvested: Object.values(cost).reduce((a, b) => a + b, 0) * ELEMENT_CREDIT_VALUE,
        };
        player.towers.push(tower);
        this.broadcast({ type: 'TOWER_PLACED', playerId, tower });
        this.broadcastStateUpdate();
        break;
      }

      case 'UPGRADE_ELEMENT_TOWER': {
        if (this.state.phase !== 'prep') return;
        const tower = player.towers.find(t => t.instanceId === msg.towerId);
        if (!tower || tower.kind !== 'element') return;
        const elemTower = tower as ElementTowerInstance;
        if (elemTower.rank >= 3) return;

        const etDef = ELEMENT_TOWER_MAP[elemTower.elementTowerId];
        if (!etDef) return;

        if (elemTower.rank === 1) {
          // Rank 1→2: 2x each element
          const cost = getElementUpgradeCost(etDef, 1);
          for (const [elem, qty] of Object.entries(cost)) {
            if ((player.elementInventory[elem as Element] || 0) < qty) return;
          }
          for (const [elem, qty] of Object.entries(cost)) {
            player.elementInventory[elem as Element] -= qty;
          }
          elemTower.rank = 2;
          elemTower.totalInvested += Object.values(cost).reduce((a, b) => a + b, 0) * ELEMENT_CREDIT_VALUE;
        } else if (elemTower.rank === 2) {
          // Rank 2→3 (pure): must be mono-element, 3x of that element
          if (etDef.elements.length !== 1) return; // only mono can go pure
          if (player.pureTowerSlot !== null) return; // only 1 pure at a time

          const cost = getElementUpgradeCost(etDef, 2);
          if (Object.keys(cost).length === 0) return;
          for (const [elem, qty] of Object.entries(cost)) {
            if ((player.elementInventory[elem as Element] || 0) < qty) return;
          }
          for (const [elem, qty] of Object.entries(cost)) {
            player.elementInventory[elem as Element] -= qty;
          }
          elemTower.rank = 3;
          elemTower.isPure = true;
          elemTower.totalInvested += Object.values(cost).reduce((a, b) => a + b, 0) * ELEMENT_CREDIT_VALUE;
          player.pureTowerSlot = elemTower.instanceId;
        }

        this.broadcast({ type: 'TOWER_UPGRADED', playerId, towerId: msg.towerId });
        this.broadcastStateUpdate();
        break;
      }

      case 'SELL_TOWER': {
        const towerIdx = player.towers.findIndex(t => t.instanceId === msg.instanceId);
        if (towerIdx < 0) return;
        const tower = player.towers[towerIdx];
        const refund = getTowerSellPrice(tower);
        player.credits += refund;

        // If selling a pure tower, free the slot
        if (tower.kind === 'element' && (tower as ElementTowerInstance).isPure) {
          player.pureTowerSlot = null;
        }

        player.towers.splice(towerIdx, 1);
        this.broadcast({ type: 'TOWER_SOLD', playerId, towerId: msg.instanceId, refund });
        this.broadcastStateUpdate();
        break;
      }

      case 'SELECT_BOSS_ELEMENT': {
        if (this.state.phase !== 'bossSelect') return;
        if (player.bossState.active) return; // already selected

        player.bossState = {
          active: true,
          element: msg.element,
          passes: 0,
          damagePerPass: BOSS_DAMAGE_PER_PASS,
        };

        this.broadcast({ type: 'BOSS_SPAWNED', playerId, element: msg.element });

        // Check if all alive players have selected
        const allSelected = this.state.players
          .filter(p => p.alive)
          .every(p => p.bossState.active);

        if (allSelected) {
          if (this.phaseTimer) { clearInterval(this.phaseTimer); this.phaseTimer = null; }
          this.startBossFight();
        }
        break;
      }

      case 'BUY_PVP_UNIT': {
        if (this.state.phase !== 'prep') return;
        const alivePlayers = this.state.players.filter(p => p.alive && p.id !== playerId);
        const isSolo = alivePlayers.length === 0;

        if (!isSolo) {
          const targetPlayer = this.state.players.find(p => p.id === msg.targetPlayerId && p.alive);
          if (!targetPlayer || targetPlayer.id === playerId) return;
        }

        if (this.pvpShop.buyUnit(player, msg.unitId)) {
          if (!isSolo) {
            this.pvpPending.push({ fromId: playerId, toId: msg.targetPlayerId, unitId: msg.unitId });
            this.broadcast({ type: 'PVP_UNIT_SENT', fromId: playerId, toId: msg.targetPlayerId, unitId: msg.unitId });
          }
          // In solo: income bonus still applies, no mobs sent
          this.broadcastStateUpdate();
        }
        break;
      }

      case 'DEV_START_COMBAT': {
        if (this.state.phase !== 'prep') return;
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

  // ── Helpers ─────────────────────────────────────────

  private isValidPlacement(player: PlayerState, pos: GridPos): boolean {
    if (isPathCell(this.map, pos)) return false;
    if (pos.row < 0 || pos.row >= GRID_SIZE || pos.col < 0 || pos.col >= GRID_SIZE) return false;
    if (player.towers.some(t => t.position.row === pos.row && t.position.col === pos.col)) return false;
    return true;
  }

  isBossRound(round: number): boolean {
    return round > 0 && round % BOSS_ROUND_INTERVAL === 0;
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
        client.ws.send(JSON.stringify({ type: 'STATE_UPDATE', state: filteredState } as ServerMsg));
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
          credits: 0,
        } as PlayerState;
      }),
    };
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

    this.state.isBossRound = this.isBossRound(this.state.round);

    if (this.state.isBossRound) {
      this.startBossSelect();
    } else {
      this.startPrepPhase();
    }
  }

  startBossSelect() {
    this.state.phase = 'bossSelect';
    this.state.timer = BOSS_SELECT_DURATION;

    // Reset boss state for all players
    this.state.players.filter(p => p.alive).forEach(p => {
      p.bossState = emptyBossState();
    });

    this.broadcast({
      type: 'PHASE_CHANGE',
      phase: 'bossSelect',
      round: this.state.round,
      timer: BOSS_SELECT_DURATION,
    });
    this.broadcast({ type: 'BOSS_SELECT', round: this.state.round });
    this.broadcastStateUpdate();

    if (this.phaseTimer) { clearInterval(this.phaseTimer); this.phaseTimer = null; }
    this.phaseTimer = setInterval(() => {
      this.state.timer -= this.speed;
      if (this.state.timer <= 0) {
        this.state.timer = 0;
        clearInterval(this.phaseTimer!);
        this.phaseTimer = null;

        // Auto-select random element for players who didn't pick
        this.state.players.filter(p => p.alive && !p.bossState.active).forEach(p => {
          const elem = ALL_ELEMENTS[Math.floor(Math.random() * ALL_ELEMENTS.length)];
          p.bossState = {
            active: true,
            element: elem,
            passes: 0,
            damagePerPass: BOSS_DAMAGE_PER_PASS,
          };
          this.broadcast({ type: 'BOSS_SPAWNED', playerId: p.id, element: elem });
        });

        this.startBossFight();
      }
    }, 1000);
  }

  startBossFight() {
    this.state.phase = 'bossFight';
    this.broadcast({
      type: 'PHASE_CHANGE',
      phase: 'bossFight',
      round: this.state.round,
      timer: 0,
    });

    // Spawn boss for each player
    this.state.players.filter(p => p.alive).forEach(p => {
      const bossElem = p.bossState.element!;
      const boss = this.combat.spawnBoss(this.state.round, bossElem);
      this.state.mobs[p.id] = [boss];
      p.bossState.bossHp = boss.hp;
      p.bossState.bossMaxHp = boss.maxHp;
    });

    this.broadcastStateUpdate();

    // Start combat tick
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    this.tickCount = 0;
    this.tickInterval = setInterval(() => {
      for (let i = 0; i < this.speed; i++) {
        if (this.state.phase !== 'bossFight') break;
        this.bossTick();
      }
    }, TICK_MS);
  }

  bossTick() {
    if (this.state.phase === 'gameOver') return;
    this.tickCount++;

    this.state.players.filter(p => p.alive).forEach(p => {
      const mobs = this.state.mobs[p.id] || [];
      if (mobs.length === 0) return; // boss already killed

      const result = this.combat.tick(p, mobs, TICK_MS);

      // Boss killed
      result.killed.forEach(mob => {
        if (mob.isBoss && mob.bossElement) {
          const elem = mob.bossElement;
          p.elementInventory[elem] = (p.elementInventory[elem] || 0) + 1;
          p.credits += this.economy.bossKillReward();
          this.broadcast({ type: 'BOSS_KILLED', playerId: p.id, element: elem });
          this.broadcast({ type: 'ELEMENT_GAINED', playerId: p.id, element: elem, newCount: p.elementInventory[elem] });
        }
      });

      // Boss leaked = loops back, player takes damage
      result.leaked.forEach(mob => {
        if (mob.isBoss) {
          p.bossState.passes++;
          const dmg = p.bossState.damagePerPass;
          p.hp = Math.max(0, p.hp - dmg);
          this.broadcast({ type: 'BOSS_PASS', playerId: p.id, damage: dmg, passes: p.bossState.passes });

          // Respawn boss at entry
          mob.x = this.map.entry.col;
          mob.y = this.map.entry.row;
          mob.pathIndex = 0;
          mob.effects = [];
          result.remaining.push(mob);
        }
      });

      if (result.attacks.length > 0 || result.killed.length > 0) {
        this.broadcast({
          type: 'COMBAT_EVENTS',
          playerId: p.id,
          attacks: result.attacks.map(a => ({
            towerX: a.towerX, towerY: a.towerY,
            targetX: a.targetX, targetY: a.targetY,
            damage: a.damage, element: a.element,
            towerElement: a.towerElement, mobElement: a.mobElement,
            effectiveness: a.effectiveness, splash: a.splash,
          })),
          kills: result.killed.map(m => ({ mobId: m.instanceId, x: m.x, y: m.y, gold: 0 })),
          leaks: [],
        });
      }

      this.state.mobs[p.id] = result.remaining;
    });

    // Check player deaths
    this.state.players.forEach(p => {
      if (p.alive && p.hp <= 0) {
        p.alive = false;
        this.broadcast({ type: 'PLAYER_ELIMINATED', playerId: p.id });
      }
    });

    // Check win condition
    const alivePlayers = this.state.players.filter(p => p.alive);
    if (alivePlayers.length === 0 || (this.state.players.length > 1 && alivePlayers.length <= 1)) {
      clearInterval(this.tickInterval!);
      this.endGame();
      return;
    }

    if (this.tickCount % MOB_SYNC_INTERVAL === 0) {
      this.broadcast({ type: 'MOB_SYNC', mobs: this.state.mobs });
    }
    if (this.tickCount % 10 === 0) {
      this.broadcastStateUpdate();
    }

    // Check if all bosses are dead
    const allBossesDead = this.state.players
      .filter(p => p.alive)
      .every(p => (this.state.mobs[p.id] || []).length === 0);

    if (allBossesDead) {
      clearInterval(this.tickInterval!);
      this.tickInterval = null;
      // Boss round done → go to prep phase
      this.startPrepPhase();
    }
  }

  startPrepPhase() {
    this.state.phase = 'prep';
    const duration = this.state.round <= 1 ? FIRST_PREP_PHASE_DURATION : PREP_PHASE_DURATION;
    this.state.timer = duration;

    // Give income
    this.state.players.filter(p => p.alive).forEach(p => {
      this.economy.endOfRoundIncome(p);
    });

    // Broadcast next wave info
    this.broadcastNextWaveInfo();

    this.broadcast({
      type: 'PHASE_CHANGE',
      phase: 'prep',
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

  broadcastNextWaveInfo() {
    const nextRound = this.state.round + 1;
    if (nextRound > TOTAL_ROUNDS) return;
    if (this.isBossRound(nextRound)) {
      this.broadcast({ type: 'NEXT_WAVE_INFO', mobType: 'boss', count: 1, hp: 0 });
      return;
    }

    const baseHp = Math.floor(MOB_BASE_HP * Math.pow(MOB_HP_SCALE, nextRound - 1));
    const baseCount = Math.floor(5 + 0.4 * nextRound);
    const isSwarmRound = nextRound % 3 === 0;
    const isRunnerRound = !isSwarmRound && nextRound % 2 === 0;

    let mobType: string, count: number, hp: number;
    if (isSwarmRound) { mobType = 'swarm'; count = Math.floor(baseCount * 2.5); hp = Math.floor(baseHp * 0.4); }
    else if (isRunnerRound) { mobType = 'runner'; count = baseCount; hp = Math.floor(baseHp * 0.6); }
    else { mobType = 'tank'; count = Math.max(2, Math.floor(baseCount * 0.6)); hp = Math.floor(baseHp * 2.2); }

    this.broadcast({ type: 'NEXT_WAVE_INFO', mobType, count, hp });
  }

  startCombat() {
    if (this.state.phase === 'gameOver') return;
    this.state.phase = 'combat';
    this.broadcast({ type: 'PHASE_CHANGE', phase: 'combat', round: this.state.round, timer: 0 });

    // Spawn wave mobs for each alive player
    this.state.players.filter(p => p.alive).forEach(p => {
      this.state.mobs[p.id] = this.combat.spawnWave(this.state.round);
    });

    // Spawn PvP units
    for (const pend of this.pvpPending) {
      const target = this.state.players.find(p => p.id === pend.toId && p.alive);
      if (!target) continue;
      const pvpMob = this.combat.spawnPvPMob(this.state.round, pend.unitId);
      if (!this.state.mobs[target.id]) this.state.mobs[target.id] = [];
      this.state.mobs[target.id].push(pvpMob);
    }
    this.pvpPending = [];

    this.broadcastStateUpdate();

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

    this.state.players.filter(p => p.alive).forEach(p => {
      const result = this.combat.tick(p, this.state.mobs[p.id], TICK_MS);

      result.killed.forEach(() => {
        p.credits += KILL_REWARD;
      });

      result.leaked.forEach(mob => {
        const damage = Math.ceil(mob.maxHp / 50) + 1;
        p.hp = Math.max(0, p.hp - damage);
        this.broadcast({ type: 'MOB_LEAKED', playerId: p.id, mobId: mob.instanceId, damage });
      });

      if (result.attacks.length > 0 || result.killed.length > 0 || result.leaked.length > 0) {
        this.broadcast({
          type: 'COMBAT_EVENTS',
          playerId: p.id,
          attacks: result.attacks.map(a => ({
            towerX: a.towerX, towerY: a.towerY,
            targetX: a.targetX, targetY: a.targetY,
            damage: a.damage, element: a.element,
            towerElement: a.towerElement, mobElement: a.mobElement,
            effectiveness: a.effectiveness, splash: a.splash,
          })),
          kills: result.killed.map(m => ({ mobId: m.instanceId, x: m.x, y: m.y, gold: KILL_REWARD })),
          leaks: result.leaked.map(m => m.instanceId),
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

    // Check eliminations
    this.state.players.forEach(p => {
      if (p.alive && p.hp <= 0) {
        p.alive = false;
        this.broadcast({ type: 'PLAYER_ELIMINATED', playerId: p.id });
      }
    });

    const alivePlayers = this.state.players.filter(p => p.alive);
    if (alivePlayers.length === 0 || (this.state.players.length > 1 && alivePlayers.length <= 1)) {
      clearInterval(this.tickInterval!);
      this.endGame();
      return;
    }

    // Check if all mobs cleared
    const allDone = this.state.players.filter(p => p.alive).every(p => (this.state.mobs[p.id] || []).length === 0);
    if (allDone) {
      clearInterval(this.tickInterval!);
      this.endRound();
    }
  }

  endRound() {
    if (this.state.phase === 'gameOver') return;
    this.broadcastStateUpdate();
    this.startNextRound();
  }

  endGame() {
    if (this.state.phase === 'gameOver') return;
    this.state.phase = 'gameOver';
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    if (this.phaseTimer) { clearInterval(this.phaseTimer); this.phaseTimer = null; }

    const alive = this.state.players.filter(p => p.alive);
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
        this.clients.forEach(client => { client.roomCode = null; });
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
  clients.forEach(c => playerToGame.set(c.id, game));

  clients.forEach(c => {
    game.sendTo(c.id, { type: 'YOUR_ID', id: c.id });
    game.sendTo(c.id, { type: 'GAME_START', state: game.state, mapDef: game.map });
  });

  setTimeout(() => game.start(), 200);
}
