import type { TowerDef, TowerType } from './types.js';
import type { Element } from './elements.js';
import { ELEMENT_COLOR } from './elements.js';

// ── 4 Simple Tower Types ────────────────────────────────

export const TOWER_DEFS: TowerDef[] = [
  {
    id: 'arrow',
    name: 'Arrow Tower',
    towerType: 'arrow',
    cost: 3,
    damage: 8,
    attackSpeed: 1.25,  // 1/0.8
    range: 3,
    description: 'Fast attacks, low damage',
  },
  {
    id: 'cannon',
    name: 'Cannon',
    towerType: 'cannon',
    cost: 5,
    damage: 25,
    attackSpeed: 0.5,  // 1/2.0
    range: 2.5,
    description: 'Slow, high damage, small splash',
    splashRadius: 0.5,
  },
  {
    id: 'income',
    name: 'Gold Mine',
    towerType: 'income',
    cost: 7,
    damage: 0,
    attackSpeed: 0,
    range: 0,
    description: 'Generates +2 gold per round',
    incomePerRound: 2,
  },
  {
    id: 'pvp',
    name: 'Monster Pit',
    towerType: 'pvp',
    cost: 6,
    damage: 0,
    attackSpeed: 0,
    range: 0,
    description: 'Sends a mob to opponent each round',
    mobPower: 1.0,
  },
];

export const TOWER_MAP: Record<string, TowerDef> = Object.fromEntries(
  TOWER_DEFS.map((t) => [t.id, t])
);

// ── Star Upgrade Stats ──────────────────────────────────

export interface TowerStats {
  damage: number;
  attackSpeed: number;
  range: number;
  splashRadius?: number;
  incomePerRound?: number;
  mobPower?: number;
  displayName: string;
  element?: Element;
  elementTier: number; // 0 = none, 1 = single element, 2 = dual element (tier 2)
}

/** Get tower stats accounting for star level, augments, and element */
export function getTowerStats(
  def: TowerDef,
  stars: number,
  augmentIds?: string[],
  element?: Element,
  elementTier?: number,
): TowerStats {
  const starMult = stars >= 1 ? 2 : 1; // ★ = 2x stats

  let damage = def.damage * starMult;
  let attackSpeed = def.attackSpeed * starMult;
  let range = def.range;
  let splashRadius = def.splashRadius;
  let incomePerRound = def.incomePerRound ? def.incomePerRound * starMult : undefined;
  let mobPower = def.mobPower ? def.mobPower * starMult : undefined;

  // Apply augment buffs
  if (augmentIds) {
    for (const id of augmentIds) {
      if (id === 'ARROW_MASTERY' && def.towerType === 'arrow') {
        damage *= 1.2;
      }
      if (id === 'CANNON_MASTERY' && def.towerType === 'cannon' && splashRadius) {
        splashRadius *= 1.5;
      }
      if (id === 'MEGA_INCOME' && def.towerType === 'income' && incomePerRound) {
        incomePerRound *= 2;
      }
      if (id === 'WIND_BOOST') {
        attackSpeed *= (1 / 0.85); // 15% faster
      }
    }
  }

  // Wind element: +25% attack speed for arrows (tier 2: +40%)
  if (element === 'wind' && def.towerType === 'arrow') {
    const windBonus = (elementTier || 1) >= 2 ? 1.4 : 1.25;
    attackSpeed *= windBonus;
  }

  // Earth element: +30% splash radius for cannons (tier 2: +50%)
  if (element === 'earth' && def.towerType === 'cannon' && splashRadius) {
    const earthBonus = (elementTier || 1) >= 2 ? 1.5 : 1.3;
    splashRadius *= earthBonus;
  }

  const starLabel = stars >= 1 ? ' ★' : '';
  const elemLabel = element ? ` [${element.charAt(0).toUpperCase() + element.slice(1)}]` : '';
  return {
    damage: Math.round(damage * 10) / 10,
    attackSpeed: Math.round(attackSpeed * 100) / 100,
    range,
    splashRadius,
    incomePerRound,
    mobPower,
    displayName: `${def.name}${starLabel}${elemLabel}`,
    element,
    elementTier: elementTier || 0,
  };
}

// ── Tower Colors for Rendering ──────────────────────────

export const TOWER_COLORS: Record<TowerType, string> = {
  arrow: '#4EA8DE',
  cannon: '#FF6B35',
  income: '#FFD93D',
  pvp: '#9B5DE5',
};

/** Get tower display color, using element color if available */
export function getTowerDisplayColor(towerType: TowerType, element?: Element): string {
  if (element) return ELEMENT_COLOR[element];
  return TOWER_COLORS[towerType];
}
