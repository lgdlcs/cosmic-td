import { nanoid } from 'nanoid';
import type {
  GameState,
  GameMap,
  PlayerState,
  MobInstance,
  TowerInstance,
  BaseTowerInstance,
  ElementTowerInstance,
} from '@ect/shared';
import type { Element } from '@ect/shared';
import {
  MOB_BASE_HP,
  MOB_HP_SCALE,
  MOB_COUNT_BASE,
  MOB_COUNT_SCALE,
  BOSS_HP_MULT,
  RUNNER_SPEED_MULT,
  RUNNER_HP_MULT,
  TANK_SPEED_MULT,
  TANK_HP_MULT,
  SWARM_COUNT_MULT,
  SWARM_HP_MULT,
  BASE_TOWER_MAP,
  ELEMENT_TOWER_MAP,
  getBaseTowerStats,
  getElementTowerStats,
  getElementMultiplier,
  getEffectiveness,
  randomElement,
  COMBO_MAP,
  PVP_UNIT_MAP,
} from '@ect/shared';
import type { TowerStats } from '@ect/shared';

export interface AttackEvent {
  towerId: string;
  towerX: number;
  towerY: number;
  targetId: string;
  targetX: number;
  targetY: number;
  damage: number;
  element: string;
  towerElement?: Element;
  mobElement?: Element;
  effectiveness?: 'strong' | 'weak' | 'neutral';
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

  /** Spawn regular wave mobs */
  spawnWave(round: number): MobInstance[] {
    const baseHp = Math.floor(MOB_BASE_HP * Math.pow(MOB_HP_SCALE, round - 1));
    const baseCount = Math.floor(MOB_COUNT_BASE + MOB_COUNT_SCALE * round);
    const assignElement = round >= 3;

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

    const mobs: MobInstance[] = [];
    for (let i = 0; i < count; i++) {
      const entry = this.map.entry;
      const staggerOffset = i * (isSwarmRound ? 0.3 : 0.6);
      mobs.push({
        instanceId: nanoid(8),
        defId: mobType,
        hp,
        maxHp: hp,
        x: entry.col,
        y: entry.row - staggerOffset,
        pathIndex: 0,
        effects: [],
        visible: true,
        element: assignElement ? randomElement() : undefined,
        armor: 0,
      });
    }

    this.cooldowns.clear();
    return mobs;
  }

  /** Spawn boss mob for a boss round */
  spawnBoss(round: number, element: Element): MobInstance {
    const baseHp = Math.floor(MOB_BASE_HP * Math.pow(MOB_HP_SCALE, round - 1));
    const bossHp = Math.floor(baseHp * BOSS_HP_MULT);
    const entry = this.map.entry;

    return {
      instanceId: nanoid(8),
      defId: 'boss',
      hp: bossHp,
      maxHp: bossHp,
      x: entry.col,
      y: entry.row,
      pathIndex: 0,
      effects: [],
      visible: true,
      element,
      armor: 0,
      isBoss: true,
      bossElement: element,
    };
  }

  /** Spawn PvP mob sent by opponent */
  spawnPvPMob(round: number, unitId: string): MobInstance {
    const unitDef = PVP_UNIT_MAP[unitId];
    if (!unitDef) {
      // Fallback to grunt
      return this.spawnPvPMob(round, 'pvp_grunt');
    }

    const baseHp = Math.floor(MOB_BASE_HP * Math.pow(MOB_HP_SCALE, round - 1));
    const hp = Math.floor(baseHp * unitDef.hp_mult);
    const entry = this.map.entry;

    return {
      instanceId: nanoid(8),
      defId: unitId,
      hp,
      maxHp: hp,
      x: entry.col,
      y: entry.row - 1,
      pathIndex: 0,
      effects: [],
      visible: true,
      element: randomElement(),
      armor: 0,
      isPvp: true,
    };
  }

  /** Get tower stats for any tower instance */
  private getTowerStats(tower: TowerInstance): TowerStats | null {
    if (tower.kind === 'base') {
      const def = BASE_TOWER_MAP[tower.towerType];
      if (!def) return null;
      return getBaseTowerStats(def, tower.tier, tower.t3PlusElement);
    } else {
      const def = ELEMENT_TOWER_MAP[tower.elementTowerId];
      if (!def) return null;
      return getElementTowerStats(def, tower.rank as 1 | 2 | 3);
    }
  }

  /** Get the element of a tower for combat purposes */
  private getTowerElement(tower: TowerInstance): Element | undefined {
    if (tower.kind === 'base') {
      return tower.t3PlusElement;
    } else {
      return tower.elements[0];
    }
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

      // Path-following movement
      let baseSpeed = 1.5;
      if (mob.defId === 'runner' || mob.defId === 'pvp_runner') baseSpeed *= RUNNER_SPEED_MULT;
      else if (mob.defId === 'tank' || mob.defId === 'pvp_tank') baseSpeed *= TANK_SPEED_MULT;
      else if (mob.defId === 'boss') baseSpeed *= 0.7;

      let speed = baseSpeed;
      let frozen = false;
      let stunned = false;
      for (const effect of mob.effects) {
        if (effect.type === 'slow') speed *= (1 - effect.value);
        if (effect.type === 'freeze') frozen = true;
        if (effect.type === 'stun') stunned = true;
      }
      if (frozen || stunned) speed = 0;
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

      if (mob.hp <= 0) {
        killed.push(mob);
      } else {
        remaining.push(mob);
      }
    }

    // Tower attacks
    for (const tower of player.towers) {
      const stats = this.getTowerStats(tower);
      if (!stats || stats.attackSpeed <= 0) continue;

      // Cooldown
      const cd = this.cooldowns.get(tower.instanceId) || 0;
      if (cd > 0) {
        this.cooldowns.set(tower.instanceId, cd - dtMs);
        continue;
      }

      // Find target in range
      const inRange = remaining.filter((m) => {
        const dx = m.x - tower.position.col;
        const dy = m.y - tower.position.row;
        return Math.sqrt(dx * dx + dy * dy) <= stats.range;
      });

      if (inRange.length === 0) continue;

      inRange.sort((a, b) => b.pathIndex - a.pathIndex);
      const target = inRange[0];

      // Calculate damage
      const towerElement = this.getTowerElement(tower);
      let finalDamage = stats.damage;

      // Element multiplier
      const elemMult = getElementMultiplier(towerElement, target.element);
      finalDamage *= elemMult;

      // Apply combo effects for element towers
      if (tower.kind === 'element' && stats.comboId) {
        const combo = COMBO_MAP[stats.comboId];
        if (combo) {
          this.applyComboEffects(combo, target, finalDamage, remaining);
        }
      }

      // Apply T3+ element effects for base towers
      if (tower.kind === 'base' && tower.t3PlusElement) {
        this.applyElementEffect(tower.t3PlusElement, tower.towerType, target, finalDamage, remaining);
      }

      target.hp -= finalDamage;

      // Splash for railgun or splash towers
      const splashRadius = stats.splashRadius;
      if (splashRadius && splashRadius > 0) {
        const splashTargets = remaining.filter((m) => {
          if (m === target) return false;
          const dx = m.x - target.x;
          const dy = m.y - target.y;
          return Math.sqrt(dx * dx + dy * dy) <= splashRadius;
        });
        for (const st of splashTargets) {
          const stMult = getElementMultiplier(towerElement, st.element);
          const splashDmg = stats.damage * 0.5 * stMult;
          st.hp -= splashDmg;
        }
      }

      // Set cooldown
      this.cooldowns.set(tower.instanceId, 1000 / stats.attackSpeed);

      const effectiveness = getEffectiveness(towerElement, target.element);

      attacks.push({
        towerId: tower.instanceId,
        towerX: tower.position.col,
        towerY: tower.position.row,
        targetId: target.instanceId,
        targetX: target.x,
        targetY: target.y,
        damage: finalDamage,
        element: tower.kind === 'base' ? tower.towerType : 'element',
        towerElement,
        mobElement: target.element,
        effectiveness,
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

  /** Apply element effect from T3+ base towers */
  private applyElementEffect(
    element: Element,
    towerType: string,
    target: MobInstance,
    damage: number,
    remaining: MobInstance[],
  ) {
    if (towerType === 'blaster') {
      switch (element) {
        case 'solar':
          target.effects.push({ type: 'burn', remaining: 2000, value: 3 });
          break;
        case 'cryo':
          target.effects.push({ type: 'slow', remaining: 1000, value: 0.2 });
          break;
        case 'asteroid':
          if (Math.random() < 0.1) target.effects.push({ type: 'stun', remaining: 500, value: 1 });
          break;
        case 'void':
          target.effects.push({ type: 'poison', remaining: 3000, value: 2 });
          break;
        case 'photon':
          // bonus damage handled through element multiplier
          break;
        case 'bio':
          target.effects.push({ type: 'slow', remaining: 500, value: 0.3 });
          break;
        case 'nebula':
          // attack speed bonus handled in stats
          break;
      }
    } else if (towerType === 'railgun') {
      switch (element) {
        case 'solar':
          for (const m of remaining) {
            const dx = m.x - target.x;
            const dy = m.y - target.y;
            if (Math.sqrt(dx * dx + dy * dy) <= 1.5) {
              m.effects.push({ type: 'burn', remaining: 2000, value: 2 });
            }
          }
          break;
        case 'cryo':
          for (const m of remaining) {
            const dx = m.x - target.x;
            const dy = m.y - target.y;
            if (Math.sqrt(dx * dx + dy * dy) <= 1.5) {
              m.effects.push({ type: 'slow', remaining: 1500, value: 0.25 });
            }
          }
          break;
        case 'void':
          target.effects.push({ type: 'armorReduce', remaining: 3000, value: 0.15 });
          break;
        default:
          break;
      }
    }
  }

  /** Apply combo effect from element towers */
  private applyComboEffects(
    combo: { effect: { type: string; value: number; value2?: number } },
    target: MobInstance,
    damage: number,
    remaining: MobInstance[],
  ) {
    const eff = combo.effect;
    switch (eff.type) {
      case 'dot_slow':
        target.effects.push({ type: 'burn', remaining: 2000, value: eff.value });
        target.effects.push({ type: 'slow', remaining: 1500, value: eff.value2 || 0.2 });
        break;
      case 'impact_zone': {
        const radius = eff.value2 || 1.5;
        for (const m of remaining) {
          const dx = m.x - target.x;
          const dy = m.y - target.y;
          if (Math.sqrt(dx * dx + dy * dy) <= radius) {
            m.effects.push({ type: 'burn', remaining: 2000, value: eff.value });
          }
        }
        break;
      }
      case 'drain_speed':
        target.effects.push({ type: 'slow', remaining: 2000, value: eff.value });
        break;
      case 'reduce_maxhp': {
        const reduction = target.maxHp * (eff.value || 0.03);
        target.maxHp = Math.max(1, target.maxHp - reduction);
        if (target.hp > target.maxHp) target.hp = target.maxHp;
        break;
      }
      case 'shatter': {
        const radius = eff.value2 || 1.5;
        const shatterDmg = damage * (eff.value || 0.4);
        for (const m of remaining) {
          if (m === target) continue;
          const dx = m.x - target.x;
          const dy = m.y - target.y;
          if (Math.sqrt(dx * dx + dy * dy) <= radius) {
            m.hp -= shatterDmg;
          }
        }
        break;
      }
      case 'full_freeze':
        if (Math.random() < (eff.value || 0.12)) {
          target.effects.push({ type: 'freeze', remaining: eff.value2 || 1000, value: 1 });
        }
        break;
      case 'split_beam': {
        const beamDmg = damage * (eff.value2 || 0.4);
        const nearby = remaining.filter(m => {
          if (m === target) return false;
          const dx = m.x - target.x;
          const dy = m.y - target.y;
          return Math.sqrt(dx * dx + dy * dy) <= 2.5;
        }).slice(0, (eff.value || 3) - 1);
        for (const m of nearby) m.hp -= beamDmg;
        break;
      }
      case 'percent_hp':
        target.hp -= target.maxHp * (eff.value || 0.03);
        break;
      case 'chain_damage': {
        const chainDmg = damage * (eff.value || 0.3);
        const radius = eff.value2 || 2;
        const nearby = remaining.filter(m => {
          if (m === target) return false;
          const dx = m.x - target.x;
          const dy = m.y - target.y;
          return Math.sqrt(dx * dx + dy * dy) <= radius;
        });
        if (nearby.length > 0) nearby[0].hp -= chainDmg;
        break;
      }
      case 'gravity_pull':
        target.effects.push({ type: 'slow', remaining: 1500, value: eff.value2 || 0.25 });
        break;
      case 'stack_freeze':
        target.effects.push({ type: 'slow', remaining: 2000, value: 0.15 });
        break;
      case 'stacking_dot': {
        const stacks = target.effects.filter(e => e.type === 'poison').length;
        const dps = (eff.value || 2) + stacks * (eff.value2 || 0.5);
        target.effects.push({ type: 'poison', remaining: 3000, value: dps });
        break;
      }
      case 'aoe_slow': {
        const radius = eff.value2 || 1.5;
        for (const m of remaining) {
          const dx = m.x - target.x;
          const dy = m.y - target.y;
          if (Math.sqrt(dx * dx + dy * dy) <= radius) {
            m.effects.push({ type: 'slow', remaining: 1500, value: eff.value || 0.35 });
          }
        }
        break;
      }
      case 'passive_aura':
        // Handled in tick as passive aura
        break;
      case 'ignore_armor':
        // Passive — handled in damage calc
        break;
      case 'cycle_element':
        // Always strong — handled in damage calc
        break;
      default:
        break;
    }
  }
}
