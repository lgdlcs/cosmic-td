import { nanoid } from 'nanoid';
import type {
  GameState,
  GameMap,
  PlayerState,
  MobInstance,
  GridPos,
  Element,
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
  getElementMultiplier,
  getEffectiveness,
  randomElement,
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

/** Zone placement for zone augments — stored per player */
export interface ZonePlacement {
  augmentId: string;
  x: number;
  y: number;
  radius: number;
  dps?: number;
  slowPercent?: number;
}

/** Temporary bio-turret spawned by Bio Railgun */
interface NatureTurret {
  x: number;
  y: number;
  damage: number;
  remaining: number; // ms
  attackCooldown: number;
}

/** Track consecutive hits for Light Arrow */
type ConsecutiveHits = Map<string, Map<string, number>>; // towerId → mobId → count

export class CombatManager {
  state: GameState;
  map: GameMap;
  cooldowns: Map<string, number> = new Map();
  /** Zone placements per player (auto-placed along path) */
  playerZones: Map<string, ZonePlacement[]> = new Map();
  /** Temporary nature turrets per player */
  natureTurrets: Map<string, NatureTurret[]> = new Map();
  /** Light arrow consecutive hit tracking */
  consecutiveHits: ConsecutiveHits = new Map();

  constructor(state: GameState, map: GameMap) {
    this.state = state;
    this.map = map;
  }

  /** Get the active element and tier for a player's towers */
  getPlayerElement(player: PlayerState): { element?: Element; tier: number } {
    if (!player.elements || player.elements.length === 0) return { tier: 0 };
    const element = player.elements[player.elements.length - 1]; // last picked
    const tier = player.elements.length >= 2 ? 2 : 1;
    return { element, tier };
  }

  /** Setup zones for a player based on their augments at combat start */
  setupZones(player: PlayerState) {
    const zones: ZonePlacement[] = [];
    const pathMid = Math.floor(this.map.path.length / 2);
    
    const solarZoneMultiplier = player.augments.includes('FIRE_STORM') ? 3 : 1;
    const { element: playerElem } = this.getPlayerElement(player);

    let zoneIndex = 0;
    for (const augId of player.augments) {
      const aug = AUGMENT_POOL.find(a => a.id === augId);
      if (!aug) continue;
      
      if (aug.effect.type === 'zone') {
        const pathOffset = pathMid + zoneIndex * 5;
        const pathPoint = this.map.path[Math.min(pathOffset, this.map.path.length - 1)];
        
        if (aug.effect.element === 'solar') {
          zones.push({
            augmentId: augId,
            x: pathPoint.col,
            y: pathPoint.row,
            radius: aug.effect.radius,
            dps: aug.effect.dps * solarZoneMultiplier,
          });
        } else if (aug.effect.element === 'cryo') {
          zones.push({
            augmentId: augId,
            x: pathPoint.col,
            y: pathPoint.row,
            radius: aug.effect.radius,
            slowPercent: aug.effect.slowPercent,
          });
        } else if (aug.effect.element === 'neutral') {
          // Neutral zone upgrades based on player's element
          const zone: ZonePlacement = {
            augmentId: augId,
            x: pathPoint.col,
            y: pathPoint.row,
            radius: aug.effect.radius,
            slowPercent: aug.effect.slowPercent,
          };
          // Upgrade zone based on player element
          if (playerElem === 'solar') {
            zone.dps = 8;
            zone.slowPercent = undefined;
          } else if (playerElem === 'cryo') {
            zone.slowPercent = 30;
          } else if (playerElem === 'asteroid') {
            zone.radius = aug.effect.radius * 1.5;
          }
          zones.push(zone);
        }
        zoneIndex++;
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
    const assignElement = round >= 3;

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
          element: assignElement ? randomElement() : undefined,
          armor: 0,
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
          element: assignElement ? randomElement() : undefined,
          armor: 0,
        });
      }
    }

    // Setup zone augments and clear nature turrets
    this.setupZones(player);
    this.natureTurrets.set(player.id, []);
    this.consecutiveHits.clear();

    return mobs;
  }

  /** Apply elemental effects from a tower attack */
  private applyElementalEffects(
    tower: { defId: string; instanceId: string },
    target: MobInstance,
    towerElement: Element | undefined,
    elementTier: number,
    damage: number,
    remaining: MobInstance[],
    player: PlayerState,
  ) {
    if (!towerElement) return;
    const def = TOWER_MAP[tower.defId];
    if (!def) return;
    const t2 = elementTier >= 2; // tier 2 = stronger effects

    if (def.towerType === 'arrow') {
      switch (towerElement) {
        case 'solar': {
          // Plasma burn DoT
          const dps = t2 ? 5 : 3;
          const dur = t2 ? 2500 : 2000;
          target.effects.push({ type: 'burn', remaining: dur, value: dps });
          break;
        }
        case 'cryo': {
          // Freeze ray slow
          const slow = t2 ? 0.30 : 0.20;
          const dur = t2 ? 1500 : 1000;
          target.effects.push({ type: 'slow', remaining: dur, value: slow });
          break;
        }
        case 'asteroid': {
          // Shrapnel stun chance
          const chance = t2 ? 0.15 : 0.10;
          if (Math.random() < chance) {
            target.effects.push({ type: 'stun', remaining: 500, value: 1 });
          }
          break;
        }
        case 'void': {
          // Entropy poison DoT (stacks)
          const dps = t2 ? 3 : 2;
          const dur = t2 ? 4000 : 3000;
          target.effects.push({ type: 'poison', remaining: dur, value: dps });
          break;
        }
        case 'photon': {
          // Photon cascade — consecutive hit bonus tracked externally
          const towerHits = this.consecutiveHits.get(tower.instanceId) || new Map();
          const hits = (towerHits.get(target.instanceId) || 0) + 1;
          towerHits.set(target.instanceId, hits);
          this.consecutiveHits.set(tower.instanceId, towerHits);
          // Bonus already applied in damage calc
          break;
        }
        case 'bio': {
          // Spore entangle (slow)
          const slow = t2 ? 0.40 : 0.30;
          target.effects.push({ type: 'slow', remaining: 500, value: slow });
          break;
        }
        case 'nebula': {
          // Ionized shots — attack speed bonus handled in getTowerStats
          break;
        }
      }
    } else if (def.towerType === 'cannon') {
      switch (towerElement) {
        case 'solar': {
          // Solar flare AoE — apply burn to all in splash
          const dps = t2 ? 4 : 2;
          for (const m of remaining) {
            const dx = m.x - target.x;
            const dy = m.y - target.y;
            if (Math.sqrt(dx * dx + dy * dy) <= 1.5) {
              m.effects.push({ type: 'burn', remaining: 2000, value: dps });
            }
          }
          break;
        }
        case 'cryo': {
          // Ice nova zone — slow all in splash
          const slow = t2 ? 0.35 : 0.25;
          for (const m of remaining) {
            const dx = m.x - target.x;
            const dy = m.y - target.y;
            if (Math.sqrt(dx * dx + dy * dy) <= 1.5) {
              m.effects.push({ type: 'slow', remaining: 1500, value: slow });
            }
          }
          break;
        }
        case 'asteroid': {
          // Meteor impact — splash radius bonus handled in getTowerStats
          break;
        }
        case 'void': {
          // Gravity well — armor reduction
          const reduction = t2 ? 0.25 : 0.15;
          target.effects.push({ type: 'armorReduce', remaining: 3000, value: reduction });
          break;
        }
        case 'photon': {
          // Beam split — chain damage to 1 nearby mob
          const chainDmg = damage * (t2 ? 0.45 : 0.30);
          const nearby = remaining.filter(m => {
            if (m === target) return false;
            const dx = m.x - target.x;
            const dy = m.y - target.y;
            return Math.sqrt(dx * dx + dy * dy) <= 2;
          });
          if (nearby.length > 0) {
            nearby[0].hp -= chainDmg;
          }
          break;
        }
        case 'bio': {
          // Spawn bio-turret
          const turrets = this.natureTurrets.get(player.id) || [];
          turrets.push({
            x: target.x,
            y: target.y,
            damage: damage * (t2 ? 0.7 : 0.5),
            remaining: t2 ? 4000 : 3000,
            attackCooldown: 0,
          });
          this.natureTurrets.set(player.id, turrets);
          break;
        }
        case 'nebula': {
          // Shockwave knockback: push mobs back along path
          const knockback = t2 ? 0.6 : 0.3;
          for (const m of remaining) {
            const dx = m.x - target.x;
            const dy = m.y - target.y;
            if (Math.sqrt(dx * dx + dy * dy) <= 1.5) {
              // Push back along path
              m.pathIndex = Math.max(0, m.pathIndex - 1);
              const prevPoint = this.map.path[m.pathIndex];
              const mdx = prevPoint.col - m.x;
              const mdy = prevPoint.row - m.y;
              const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
              if (mdist > 0.1) {
                m.x += (mdx / mdist) * knockback;
                m.y += (mdy / mdist) * knockback;
              }
            }
          }
          break;
        }
      }
    }
  }

  /** Process one tick of combat for a player */
  tick(player: PlayerState, mobs: MobInstance[], dtMs: number): TickResult {
    const killed: MobInstance[] = [];
    const leaked: MobInstance[] = [];
    const remaining: MobInstance[] = [];
    const attacks: AttackEvent[] = [];
    const dt = dtMs / 1000;

    const { element: playerElement, tier: elemTier } = this.getPlayerElement(player);

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

    // Nature turrets
    const turrets = this.natureTurrets.get(player.id) || [];
    for (const turret of turrets) {
      turret.remaining -= dtMs;
      turret.attackCooldown -= dtMs;
      if (turret.attackCooldown <= 0 && remaining.length > 0) {
        // Find nearest mob
        let nearest: MobInstance | null = null;
        let nearestDist = Infinity;
        for (const m of remaining) {
          const dx = m.x - turret.x;
          const dy = m.y - turret.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < nearestDist && d <= 2.5) {
            nearest = m;
            nearestDist = d;
          }
        }
        if (nearest) {
          nearest.hp -= turret.damage * dt * 2; // pulsing damage
          turret.attackCooldown = 500;
        }
      }
    }
    this.natureTurrets.set(player.id, turrets.filter(t => t.remaining > 0));

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

      const towerStats = getTowerStats(def, tower.stars, player.augments, playerElement, elemTier);
      
      // Find target in range
      const inRange = remaining.filter((m) => {
        const dx = m.x - tower.position.col;
        const dy = m.y - tower.position.row;
        return Math.sqrt(dx * dx + dy * dy) <= towerStats.range;
      });

      if (inRange.length === 0) continue;

      inRange.sort((a, b) => b.pathIndex - a.pathIndex);
      const target = inRange[0];

      // Calculate damage with element multiplier
      let finalDamage = towerStats.damage;
      
      // Element multiplier
      const elemMult = getElementMultiplier(playerElement, target.element);
      finalDamage *= elemMult;

      // Armor reduction from dark cannon
      const armorReduce = target.effects
        .filter(e => e.type === 'armorReduce')
        .reduce((sum, e) => sum + e.value, 0);
      if (armorReduce > 0) {
        finalDamage *= (1 + Math.min(armorReduce, 0.5)); // cap at 50% bonus
      }

      // Photon Blaster: photon cascade consecutive hit bonus
      if (playerElement === 'photon' && def.towerType === 'arrow') {
        const towerHits = this.consecutiveHits.get(tower.instanceId);
        const hits = towerHits?.get(target.instanceId) || 0;
        const bonus = elemTier >= 2 ? 0.08 : 0.05;
        finalDamage *= (1 + hits * bonus);
      }

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
          let splashDmg = finalDamage * 0.5;
          // Element multiplier for splash targets too
          const stMult = getElementMultiplier(playerElement, st.element);
          splashDmg = (towerStats.damage * 0.5) * stMult;
          st.hp -= splashDmg;
        }
      }

      // Apply elemental effects
      this.applyElementalEffects(tower, target, playerElement, elemTier, finalDamage, remaining, player);

      // Set cooldown
      if (towerStats.attackSpeed > 0) {
        this.cooldowns.set(tower.instanceId, 1000 / towerStats.attackSpeed);
      }

      const effectiveness = getEffectiveness(playerElement, target.element);

      attacks.push({
        towerId: tower.instanceId,
        towerX: tower.position.col,
        towerY: tower.position.row,
        targetId: target.instanceId,
        targetX: target.x,
        targetY: target.y,
        damage: finalDamage,
        element: def.towerType,
        towerElement: playerElement,
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
        // Clear consecutive hits for this target
        for (const [, hitMap] of this.consecutiveHits) {
          hitMap.delete(target.instanceId);
        }
      }
    }

    return { killed, leaked, remaining, attacks };
  }
}
