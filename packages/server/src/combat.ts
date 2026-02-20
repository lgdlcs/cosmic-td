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
    const count = isBoss ? 1 : Math.floor(MOB_COUNT_BASE + MOB_COUNT_SCALE * round);

    const mobs: MobInstance[] = [];
    const hp = isBoss ? baseHp * BOSS_HP_MULT : baseHp;

    // Check for Hex modifications
    const hasHaste = player.incomingHex?.hexId === 'haste';
    const hasReinforcements = player.incomingHex?.hexId === 'reinforcements';
    const extraMobs = hasReinforcements ? 5 : 0;

    for (let i = 0; i < count + extraMobs; i++) {
      const entry = this.map.entry;
      const staggerOffset = i * 0.6;
      mobs.push({
        instanceId: nanoid(8),
        defId: isBoss ? 'boss' : 'grunt',
        hp,
        maxHp: hp,
        x: entry.col,
        y: entry.row - staggerOffset,
        pathIndex: 0,
        effects: hasHaste ? [{ type: 'slow', remaining: 99999, value: -0.3 }] : [],
        visible: true,
      });
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

      // Calculate effective speed
      let speed = 1.5;
      for (const effect of mob.effects) {
        if (effect.type === 'slow') {
          speed *= (1 - effect.value);
        }
      }
      speed = Math.max(speed, 0.3);

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
