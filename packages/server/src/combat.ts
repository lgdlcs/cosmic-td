import { nanoid } from 'nanoid';
import type {
  GameState,
  GameMap,
  PlayerState,
  MobInstance,
  GridPos,
} from '@ect/shared';
import {
  MOB_BASE_HP,
  MOB_HP_SCALE,
  MOB_COUNT_BASE,
  MOB_COUNT_SCALE,
  BOSS_ROUNDS,
  BOSS_HP_MULT,
  TOWER_MAP,
  RUNNER_SPEED_MULT,
  RUNNER_HP_MULT,
  TANK_SPEED_MULT,
  TANK_HP_MULT,
  SWARM_COUNT_MULT,
  SWARM_HP_MULT,
  getTowerStats,
  AUGMENT_POOL,
} from '@ect/shared';

export interface AttackEvent {
  towerId: string;
  towerX: number;
  towerY: number;
  targetId: string;
  targetX: number;
  targetY: number;
  damage: number;
  element: string;
  splash: boolean;
}

export interface TickResult {
  killed: MobInstance[];
  leaked: MobInstance[];
  remaining: MobInstance[];
  attacks: AttackEvent[];
}

/** Zone placement for zone augments — stored per player */
export interface ZonePlacement {
  augmentId: string;
  x: number;
  y: number;
  radius: number;
  dps?: number;
  slowPercent?: number;
}

export class CombatManager {
  state: GameState;
  map: GameMap;
  cooldowns: Map<string, number> = new Map();
  /** Zone placements per player (auto-placed along path) */
  playerZones: Map<string, ZonePlacement[]> = new Map();

  constructor(state: GameState, map: GameMap) {
    this.state = state;
    this.map = map;
  }

  /** Setup zones for a player based on their augments at combat start */
  setupZones(player: PlayerState) {
    const zones: ZonePlacement[] = [];
    const pathMid = Math.floor(this.map.path.length / 2);
    
    const fireZoneMultiplier = player.augments.includes('FIRE_STORM') ? 3 : 1;

    for (const augId of player.augments) {
      const aug = AUGMENT_POOL.find(a => a.id === augId);
      if (!aug) continue;
      
      if (aug.effect.type === 'zone' && aug.effect.element === 'fire') {
        const pathPoint = this.map.path[Math.min(pathMid, this.map.path.length - 1)];
        zones.push({
          augmentId: augId,
          x: pathPoint.col,
          y: pathPoint.row,
          radius: aug.effect.radius,
          dps: aug.effect.dps * fireZoneMultiplier,
        });
      } else if (aug.effect.type === 'zone' && aug.effect.element === 'water') {
        const pathPoint = this.map.path[Math.min(pathMid + 5, this.map.path.length - 1)];
        zones.push({
          augmentId: augId,
          x: pathPoint.col,
          y: pathPoint.row,
          radius: aug.effect.radius,
          slowPercent: aug.effect.slowPercent,
        });
      }
    }
    
    this.playerZones.set(player.id, zones);
  }

  /** Spawn a wave of mobs for a round */
  spawnWave(round: number, player: PlayerState): MobInstance[] {
    const isBoss = BOSS_ROUNDS.includes(round);
    const baseHp = Math.floor(MOB_BASE_HP * Math.pow(MOB_HP_SCALE, round - 1));
    const baseCount = Math.floor(MOB_COUNT_BASE + MOB_COUNT_SCALE * round);

    const mobs: MobInstance[] = [];

    // PvP mobs from opponent monster pits are handled in game.ts
    
    // Global slow from BLIZZARD augment
    const hasGlobalSlow = player.augments.includes('BLIZZARD');

    if (isBoss) {
      const bossHp = Math.floor(baseHp * BOSS_HP_MULT);
      const bossCount = round >= 20 ? 2 : 1;
      
      for (let i = 0; i < bossCount; i++) {
        const entry = this.map.entry;
        const staggerOffset = i * 1.5;
        const effects = hasGlobalSlow ? [{ type: 'slow' as const, remaining: 99999, value: 0.15 }] : [];
        mobs.push({
          instanceId: nanoid(8),
          defId: 'boss',
          hp: bossHp,
          maxHp: bossHp,
          x: entry.col,
          y: entry.row - staggerOffset,
          pathIndex: 0,
          effects,
          visible: true,
        });
      }
    } else {
      const isSwarmRound = round % 3 === 0;
      const isRunnerRound = !isSwarmRound && round % 2 === 0;

      let mobType: string;
      let count: number;
      let hp: number;

      if (isSwarmRound) {
        mobType = 'swarm';
        count = Math.floor(baseCount * SWARM_COUNT_MULT);
        hp = Math.floor(baseHp * SWARM_HP_MULT);
      } else if (isRunnerRound) {
        mobType = 'runner';
        count = baseCount;
        hp = Math.floor(baseHp * RUNNER_HP_MULT);
      } else {
        mobType = 'tank';
        count = Math.max(2, Math.floor(baseCount * 0.6));
        hp = Math.floor(baseHp * TANK_HP_MULT);
      }

      for (let i = 0; i < count; i++) {
        const entry = this.map.entry;
        const staggerOffset = i * (isSwarmRound ? 0.3 : 0.6);
        const effects = hasGlobalSlow ? [{ type: 'slow' as const, remaining: 99999, value: 0.15 }] : [];

        mobs.push({
          instanceId: nanoid(8),
          defId: mobType,
          hp,
          maxHp: hp,
          x: entry.col,
          y: entry.row - staggerOffset,
          pathIndex: 0,
          effects,
          visible: true,
        });
      }
    }

    // Setup zone augments
    this.setupZones(player);

    return mobs;
  }

  /** Process one tick of combat for a player */
  tick(player: PlayerState, mobs: MobInstance[], dtMs: number): TickResult {
    const killed: MobInstance[] = [];
    const leaked: MobInstance[] = [];
    const remaining: MobInstance[] = [];
    const attacks: AttackEvent[] = [];
    const dt = dtMs / 1000;

    // Move mobs
    for (const mob of mobs) {
      if (mob.hp <= 0) {
        killed.push(mob);
        continue;
      }

      let baseSpeed = 1.5;
      if (mob.defId === 'runner') baseSpeed *= RUNNER_SPEED_MULT;
      else if (mob.defId === 'tank') baseSpeed *= TANK_SPEED_MULT;
      else if (mob.defId === 'boss') baseSpeed *= 0.7;

      let speed = baseSpeed;
      let frozen = false;
      for (const effect of mob.effects) {
        if (effect.type === 'slow') speed *= (1 - effect.value);
        if (effect.type === 'freeze') frozen = true;
      }
      if (frozen) speed = 0;
      else speed = Math.max(speed, 0.2);

      const nextIdx = mob.pathIndex + 1;
      if (nextIdx >= this.map.path.length) {
        leaked.push(mob);
        continue;
      }

      const target = this.map.path[nextIdx];
      const dx = target.col - mob.x;
      const dy = target.row - mob.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < speed * dt) {
        mob.x = target.col;
        mob.y = target.row;
        mob.pathIndex = nextIdx;
      } else {
        mob.x += (dx / dist) * speed * dt;
        mob.y += (dy / dist) * speed * dt;
      }

      // Tick effects
      mob.effects = mob.effects
        .map((e) => ({ ...e, remaining: e.remaining - dtMs }))
        .filter((e) => e.remaining > 0);

      // Apply DoT effects
      for (const effect of mob.effects) {
        if (effect.type === 'poison' || effect.type === 'burn') {
          mob.hp -= effect.value * dt;
        }
      }

      // Apply zone augment effects
      const zones = this.playerZones.get(player.id) || [];
      for (const zone of zones) {
        const zdx = mob.x - zone.x;
        const zdy = mob.y - zone.y;
        const zdist = Math.sqrt(zdx * zdx + zdy * zdy);
        if (zdist <= zone.radius) {
          if (zone.dps) {
            mob.hp -= zone.dps * dt;
          }
          if (zone.slowPercent) {
            // Apply slow if not already slowed by this zone
            const hasZoneSlow = mob.effects.some(e => e.type === 'slow' && e.value === zone.slowPercent! / 100);
            if (!hasZoneSlow) {
              mob.effects.push({ type: 'slow', remaining: 500, value: zone.slowPercent / 100 });
            }
          }
        }
      }

      if (mob.hp <= 0) {
        killed.push(mob);
      } else {
        remaining.push(mob);
      }
    }

    // Tower attacks (only arrow and cannon towers attack)
    for (const tower of player.towers) {
      const def = TOWER_MAP[tower.defId];
      if (!def || def.towerType === 'income' || def.towerType === 'pvp') continue;

      // Cooldown
      const cd = this.cooldowns.get(tower.instanceId) || 0;
      if (cd > 0) {
        this.cooldowns.set(tower.instanceId, cd - dtMs);
        continue;
      }

      const towerStats = getTowerStats(def, tower.stars, player.augments);
      
      // Find target in range
      const inRange = remaining.filter((m) => {
        const dx = m.x - tower.position.col;
        const dy = m.y - tower.position.row;
        return Math.sqrt(dx * dx + dy * dy) <= towerStats.range;
      });

      if (inRange.length === 0) continue;

      inRange.sort((a, b) => b.pathIndex - a.pathIndex);
      const target = inRange[0];

      const finalDamage = towerStats.damage;
      target.hp -= finalDamage;

      // Splash damage for cannons
      const splashRadius = towerStats.splashRadius;
      if (splashRadius && splashRadius > 0) {
        const splashTargets = remaining.filter((m) => {
          if (m === target) return false;
          const dx = m.x - target.x;
          const dy = m.y - target.y;
          return Math.sqrt(dx * dx + dy * dy) <= splashRadius;
        });
        for (const st of splashTargets) {
          st.hp -= finalDamage * 0.5;
        }
      }

      // Set cooldown
      if (towerStats.attackSpeed > 0) {
        this.cooldowns.set(tower.instanceId, 1000 / towerStats.attackSpeed);
      }

      attacks.push({
        towerId: tower.instanceId,
        towerX: tower.position.col,
        towerY: tower.position.row,
        targetId: target.instanceId,
        targetX: target.x,
        targetY: target.y,
        damage: finalDamage,
        element: def.towerType,
        splash: !!(splashRadius && splashRadius > 0),
      });

      if (target.hp <= 0) {
        const idx = remaining.indexOf(target);
        if (idx >= 0) {
          remaining.splice(idx, 1);
          killed.push(target);
        }
      }
    }

    return { killed, leaked, remaining, attacks };
  }
}
