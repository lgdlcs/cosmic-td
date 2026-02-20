import { nanoid } from 'nanoid';
import type {
  GameState,
  GameMap,
  PlayerState,
  MobInstance,
  TowerInstance,
  GridPos,
} from '@ect/shared';
import {
  MOB_BASE_HP,
  MOB_HP_SCALE,
  MOB_COUNT_BASE,
  MOB_COUNT_SCALE,
  BOSS_ROUNDS,
  BOSS_HP_MULT,
  STAR_DAMAGE_MULT,
  SYNERGY_THRESHOLDS,
  TOWER_MAP,
  RUNNER_SPEED_MULT,
  RUNNER_HP_MULT,
  TANK_SPEED_MULT,
  TANK_HP_MULT,
  SWARM_COUNT_MULT,
  SWARM_HP_MULT,
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

export class CombatManager {
  state: GameState;
  map: GameMap;
  cooldowns: Map<string, number> = new Map();

  constructor(state: GameState, map: GameMap) {
    this.state = state;
    this.map = map;
  }

  /** Spawn a wave of mobs for a round */
  spawnWave(round: number, player: PlayerState): MobInstance[] {
    const isBoss = BOSS_ROUNDS.includes(round);
    const baseHp = Math.floor(MOB_BASE_HP * Math.pow(MOB_HP_SCALE, round - 1));
    const baseCount = Math.floor(MOB_COUNT_BASE + MOB_COUNT_SCALE * round);

    const mobs: MobInstance[] = [];

    // Check for Hex modifications
    const hasHaste = player.incomingHex?.hexId === 'haste';
    const hasReinforcements = player.incomingHex?.hexId === 'reinforcements';
    const extraMobs = hasReinforcements ? 5 : 0;

    if (isBoss) {
      // Boss waves: 1-2 massive HP bosses
      const bossHp = Math.floor(baseHp * BOSS_HP_MULT);
      const bossCount = round >= 20 ? 2 : 1; // 2 bosses at high rounds
      
      for (let i = 0; i < bossCount; i++) {
        const entry = this.map.entry;
        const staggerOffset = i * 1.5;
        mobs.push({
          instanceId: nanoid(8),
          defId: 'boss',
          hp: bossHp,
          maxHp: bossHp,
          x: entry.col,
          y: entry.row - staggerOffset,
          pathIndex: 0,
          effects: hasHaste ? [{ type: 'slow', remaining: 99999, value: -0.3 }] : [],
          visible: true,
        });
      }
    } else {
      // Regular waves: determine mob type
      const isSwarmRound = round % 3 === 0;
      const isRunnerRound = !isSwarmRound && round % 2 === 0;
      const isTankRound = !isSwarmRound && round % 2 === 1;

      let mobType: string;
      let count: number;
      let hp: number;

      if (isSwarmRound) {
        // Swarm: many small mobs
        mobType = 'swarm';
        count = Math.floor(baseCount * SWARM_COUNT_MULT);
        hp = Math.floor(baseHp * SWARM_HP_MULT);
      } else if (isRunnerRound) {
        // Runners: fast, low HP
        mobType = 'runner';
        count = baseCount;
        hp = Math.floor(baseHp * RUNNER_HP_MULT);
      } else {
        // Tanks: slow, high HP
        mobType = 'tank';
        count = Math.max(2, Math.floor(baseCount * 0.6)); // Fewer tanks
        hp = Math.floor(baseHp * TANK_HP_MULT);
      }

      count += extraMobs;

      for (let i = 0; i < count; i++) {
        const entry = this.map.entry;
        const staggerOffset = i * (isSwarmRound ? 0.3 : 0.6);
        
        const effects = [];
        if (hasHaste) {
          effects.push({ type: 'slow' as const, remaining: 99999, value: -0.3 });
        }

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

    player.incomingHex = null;
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

      // Calculate effective speed based on mob type
      let baseSpeed = 1.5;
      
      // Adjust base speed by mob type
      if (mob.defId === 'runner') {
        baseSpeed *= RUNNER_SPEED_MULT;
      } else if (mob.defId === 'tank') {
        baseSpeed *= TANK_SPEED_MULT;
      } else if (mob.defId === 'swarm') {
        baseSpeed *= 1.0; // Normal speed for swarm
      } else if (mob.defId === 'boss') {
        baseSpeed *= 0.7; // Slightly slower than normal
      }

      let speed = baseSpeed;
      let frozen = false;
      for (const effect of mob.effects) {
        if (effect.type === 'slow') {
          speed *= (1 - effect.value);
        }
        if (effect.type === 'freeze') {
          frozen = true;
        }
      }
      if (frozen) speed = 0;
      else speed = Math.max(speed, 0.2);

      // Advance along path
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

      if (mob.hp <= 0) {
        killed.push(mob);
      } else {
        remaining.push(mob);
      }
    }

    // Tower attacks
    for (const tower of player.towers) {
      const def = TOWER_MAP[tower.defId];
      if (!def) continue;

      // Cooldown
      const cd = this.cooldowns.get(tower.instanceId) || 0;
      if (cd > 0) {
        this.cooldowns.set(tower.instanceId, cd - dtMs);
        continue;
      }

      // Find target (closest to exit)
      const inRange = remaining.filter((m) => {
        const dx = m.x - tower.position.col;
        const dy = m.y - tower.position.row;
        return Math.sqrt(dx * dx + dy * dy) <= def.range;
      });

      if (inRange.length === 0) continue;

      // Sort by pathIndex (highest = closest to exit)
      inRange.sort((a, b) => b.pathIndex - a.pathIndex);
      const target = inRange[0];

      // Calculate damage
      const synergyBonus = this.getSynergyBonus(player, tower);
      const starMult = STAR_DAMAGE_MULT[tower.starLevel] || 1;
      const finalDamage = def.damage * starMult * (1 + synergyBonus);

      target.hp -= finalDamage;

      // Splash damage
      const hasSplash = def.splashRadius && def.splashRadius > 0;
      if (hasSplash) {
        const splashTargets = remaining.filter((m) => {
          if (m === target) return false;
          const dx = m.x - target.x;
          const dy = m.y - target.y;
          return Math.sqrt(dx * dx + dy * dy) <= def.splashRadius!;
        });
        for (const st of splashTargets) {
          st.hp -= finalDamage * 0.5; // 50% splash
        }
      }

      // Apply tower special effects
      this.applyTowerEffect(tower, target);

      // Apply synergy special effects at 3+ of same element
      this.applySynergyEffect(player, tower, target, remaining);

      // Set cooldown
      this.cooldowns.set(tower.instanceId, 1000 / def.attackSpeed);

      // Record attack event
      attacks.push({
        towerId: tower.instanceId,
        towerX: tower.position.col,
        towerY: tower.position.row,
        targetId: target.instanceId,
        targetX: target.x,
        targetY: target.y,
        damage: finalDamage,
        element: tower.elements[0] || 'fire',
        splash: !!hasSplash,
      });

      // Check if target died from this hit
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

  private getSynergyBonus(player: PlayerState, tower: TowerInstance): number {
    let bonus = 0;
    for (const element of tower.elements) {
      const count = player.synergies[element] || 0;
      for (const threshold of SYNERGY_THRESHOLDS) {
        if (count >= threshold.count) {
          bonus = Math.max(bonus, threshold.bonus);
        }
      }
    }
    return bonus;
  }

  /** Apply special synergy effects when player has 3+ towers of the same element */
  private applySynergyEffect(player: PlayerState, tower: TowerInstance, target: MobInstance, allMobs: MobInstance[]) {
    for (const element of tower.elements) {
      const count = player.synergies[element] || 0;
      if (count < 3) continue;

      switch (element) {
        case 'fire':
          // Fire 3+: attacks cause AoE burn around target
          for (const m of allMobs) {
            if (m === target) continue;
            const dx = m.x - target.x;
            const dy = m.y - target.y;
            if (Math.sqrt(dx * dx + dy * dy) <= 1.5) {
              m.effects.push({ type: 'burn', remaining: 2000, value: 5 });
            }
          }
          break;
        case 'water':
          // Water 3+: stronger slow (40% instead of 25%)
          target.effects = target.effects.filter(e => e.type !== 'slow' || e.value < 0);
          target.effects.push({ type: 'slow', remaining: 3000, value: 0.40 });
          break;
        case 'earth':
          // Earth 3+: chance to stun (freeze) for 0.5s
          if (Math.random() < 0.15) {
            target.effects.push({ type: 'freeze', remaining: 500, value: 1.0 });
          }
          break;
        case 'wind':
          // Wind 3+: attacks chain to 1 nearby mob for 30% damage
          {
            const def = TOWER_MAP[tower.defId];
            if (!def) break;
            const nearby = allMobs
              .filter(m => m !== target && Math.sqrt((m.x - target.x) ** 2 + (m.y - target.y) ** 2) <= 1.5)
              .slice(0, 1);
            for (const m of nearby) {
              m.hp -= def.damage * 0.3;
            }
          }
          break;
        case 'dark':
          // Dark 3+: stronger poison stacking
          target.effects.push({ type: 'poison', remaining: 4000, value: 6 });
          break;
        case 'light':
          // Light 3+: reveals all mobs in range and boosts all tower damage (handled via synergy bonus already)
          for (const m of allMobs) {
            m.visible = true;
          }
          break;
      }
    }
  }

  private applyTowerEffect(tower: TowerInstance, mob: MobInstance) {
    const def = TOWER_MAP[tower.defId];
    if (!def) return;

    // Water towers slow
    if (tower.elements.includes('water')) {
      const existingSlow = mob.effects.find((e) => e.type === 'slow' && e.value > 0);
      if (!existingSlow) {
        mob.effects.push({ type: 'slow', remaining: 2000, value: 0.25 });
      }
    }

    // Dark towers poison
    if (tower.elements.includes('dark')) {
      mob.effects.push({ type: 'poison', remaining: 3000, value: 4 });
    }

    // Fire towers burn (for non-splash basic fire)
    if (tower.elements.includes('fire') && !tower.elements.includes('water')) {
      mob.effects.push({ type: 'burn', remaining: 2000, value: 3 });
    }
  }
}
