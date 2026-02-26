import type { BaseTowerDef, BaseTowerInstance, ElementTowerInstance, TowerInstance, ElementTowerDef } from './types.js';
import type { Element } from './elements.js';
import { ALL_ELEMENTS, ELEMENT_COLOR, ELEMENT_EMOJI } from './elements.js';
import { COMBO_DEFS, findCombo } from './combos.js';

// ── Base Tower Definitions ──────────────────────────────

export const BASE_TOWER_DEFS: BaseTowerDef[] = [
  {
    id: 'blaster',
    name: 'Blaster',
    towerType: 'blaster',
    cost: 100,
    tiers: [
      { damage: 10, attackSpeed: 1.25, range: 3 },          // T1
      { damage: 22, attackSpeed: 1.5, range: 3.5 },         // T2
      { damage: 40, attackSpeed: 1.8, range: 4 },           // T3
    ],
    upgradeCosts: [150, 250], // T1→T2: 150, T2→T3: 250
    description: 'Rapid fire laser shots',
    t3PlusBonus: 'Elemental shots: apply element effects on hit',
  },
  {
    id: 'railgun',
    name: 'Railgun',
    towerType: 'railgun',
    cost: 150,
    tiers: [
      { damage: 30, attackSpeed: 0.5, range: 2.5, splashRadius: 0.5 },   // T1
      { damage: 65, attackSpeed: 0.6, range: 3, splashRadius: 0.7 },     // T2
      { damage: 120, attackSpeed: 0.7, range: 3.5, splashRadius: 1.0 },  // T3
    ],
    upgradeCosts: [200, 350], // T1→T2: 200, T2→T3: 350
    description: 'Slow, massive kinetic impact with splash',
    t3PlusBonus: 'Elemental splash: element effects apply to all splashed targets',
  },
];

export const BASE_TOWER_MAP: Record<string, BaseTowerDef> = Object.fromEntries(
  BASE_TOWER_DEFS.map((t) => [t.id, t])
);

// ── Element Tower Definitions (from combos + mono) ──────

function buildElementTowerDefs(): ElementTowerDef[] {
  const defs: ElementTowerDef[] = [];

  // Mono-element towers (7 towers, one per element)
  for (const elem of ALL_ELEMENTS) {
    defs.push({
      id: `MONO_${elem.toUpperCase()}`,
      name: `${elem.charAt(0).toUpperCase() + elem.slice(1)} Tower`,
      elements: [elem],
      rank1Cost: { [elem]: 1 } as Record<Element, number>,
      description: `Pure ${elem} element tower`,
    });
  }

  // Combo towers (21 combos)
  for (const combo of COMBO_DEFS) {
    const cost: Record<Element, number> = {} as Record<Element, number>;
    cost[combo.elements[0]] = 1;
    cost[combo.elements[1]] = (cost[combo.elements[1]] || 0) + 1;
    defs.push({
      id: combo.id,
      name: combo.name,
      elements: [...combo.elements],
      comboId: combo.id,
      rank1Cost: cost,
      description: combo.description,
    });
  }

  return defs;
}

export const ELEMENT_TOWER_DEFS: ElementTowerDef[] = buildElementTowerDefs();

export const ELEMENT_TOWER_MAP: Record<string, ElementTowerDef> = Object.fromEntries(
  ELEMENT_TOWER_DEFS.map((t) => [t.id, t])
);

// ── Stats Helpers ───────────────────────────────────────

export interface TowerStats {
  damage: number;
  attackSpeed: number;
  range: number;
  splashRadius?: number;
  displayName: string;
  element?: Element;
  comboId?: string;
}

export function getBaseTowerStats(def: BaseTowerDef, tier: 1 | 2 | 3, t3PlusElement?: Element): TowerStats {
  const t = def.tiers[tier - 1];
  let damage = t.damage;
  let attackSpeed = t.attackSpeed;

  // T3+ bonus: +25% damage
  if (tier === 3 && t3PlusElement) {
    damage *= 1.25;
  }

  const tierLabel = tier >= 3 ? (t3PlusElement ? ' T3+' : ' T3') : tier >= 2 ? ' T2' : '';
  const elemLabel = t3PlusElement ? ` [${t3PlusElement}]` : '';

  return {
    damage: Math.round(damage * 10) / 10,
    attackSpeed: Math.round(attackSpeed * 100) / 100,
    range: t.range,
    splashRadius: t.splashRadius,
    displayName: `${def.name}${tierLabel}${elemLabel}`,
    element: t3PlusElement,
  };
}

export function getElementTowerStats(def: ElementTowerDef, rank: 1 | 2 | 3): TowerStats {
  // Base stats scale with rank
  const baseDamage = def.elements.length === 1 ? 15 : 25;
  const baseSpeed = def.elements.length === 1 ? 1.0 : 0.8;
  const baseRange = 3;

  const rankMult = rank === 3 ? 3 : rank === 2 ? 2 : 1;

  return {
    damage: Math.round(baseDamage * rankMult),
    attackSpeed: Math.round(baseSpeed * (1 + (rank - 1) * 0.15) * 100) / 100,
    range: baseRange + (rank - 1) * 0.5,
    displayName: `${def.name}${rank > 1 ? ` R${rank}` : ''}`,
    element: def.elements[0],
    comboId: def.comboId,
  };
}

/** Get the cost to upgrade an element tower to the next rank */
export function getElementUpgradeCost(def: ElementTowerDef, currentRank: 1 | 2): Record<Element, number> {
  const cost: Record<Element, number> = {} as Record<Element, number>;
  const nextRank = currentRank + 1;

  if (nextRank === 2) {
    // Rank 2 = 2x each element
    for (const elem of def.elements) {
      cost[elem] = (cost[elem] || 0) + 2;
    }
  } else if (nextRank === 3) {
    // Rank 3 (pure) = 3x of ONE element (must be mono-element tower)
    if (def.elements.length !== 1) {
      // Can't go pure on combo towers
      return cost;
    }
    cost[def.elements[0]] = 3;
  }

  return cost;
}

// ── Sell Price ───────────────────────────────────────────

export const SELL_RATIO = 0.7;

export function getBaseTowerSellPrice(tower: BaseTowerInstance): number {
  return Math.floor(tower.totalInvested * SELL_RATIO);
}

export function getElementTowerSellPrice(tower: ElementTowerInstance): number {
  return Math.floor(tower.totalInvested * SELL_RATIO);
}

export function getTowerSellPrice(tower: TowerInstance): number {
  if (tower.kind === 'base') return getBaseTowerSellPrice(tower);
  return getElementTowerSellPrice(tower);
}

// ── Tower Colors for Rendering ──────────────────────────

export const TOWER_TYPE_COLORS: Record<string, string> = {
  blaster: '#4EA8DE',
  railgun: '#FF6B35',
};

export function getTowerDisplayColor(tower: TowerInstance): string {
  if (tower.kind === 'base') {
    if (tower.t3PlusElement) return ELEMENT_COLOR[tower.t3PlusElement];
    return TOWER_TYPE_COLORS[tower.towerType] || '#ffffff';
  }
  // Element tower: use element color or combo color
  const def = ELEMENT_TOWER_MAP[tower.elementTowerId];
  if (def?.comboId) {
    const combo = COMBO_DEFS.find(c => c.id === def.comboId);
    if (combo) return combo.color;
  }
  if (tower.elements.length > 0) return ELEMENT_COLOR[tower.elements[0]];
  return '#ffffff';
}
