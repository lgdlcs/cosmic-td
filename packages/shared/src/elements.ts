import type { TowerDef, Element } from './types.js';
import { ELEMENT_DAMAGE_BONUS } from './constants.js';

// ── Base Towers (no elements) ─────────────────────────────

export const BASE_TOWERS: TowerDef[] = [
  {
    id: 'archer',
    name: 'Archer',
    elements: [],
    tier: 1,
    cost: 3,
    damage: 6,
    attackSpeed: 1.5,
    range: 3,
    special: 'Fast single-target attacks',
  },
  {
    id: 'cannon',
    name: 'Cannon',
    elements: [],
    tier: 1,
    cost: 4,
    damage: 12,
    attackSpeed: 0.6,
    range: 2,
    splashRadius: 1,
    special: 'Slow AoE splash damage',
  },
  {
    id: 'mage',
    name: 'Mage',
    elements: [],
    tier: 1,
    cost: 5,
    damage: 8,
    attackSpeed: 1.0,
    range: 2.5,
    special: 'Moderate damage, can apply effects',
  },
];

// ── Fragment Cost ───────────────────────────────────────────

export function getFragmentCost(_element: Element, totalBought: number): number {
  if (totalBought < 2) return 3;
  if (totalBought < 3) return 4;
  if (totalBought < 4) return 5;
  return 6;
}

// ── Element Effects ──────────────────────────────────────────

export interface ElementEffect {
  element: Element;
  name: string;
  description: string;
  damageBonus: number;
  attackSpeedBonus: number;
  rangeBonus: number;
  dotType?: 'burn' | 'poison';
  dotDps?: number;
  dotDuration?: number;
  slowPercent?: number;
  slowDuration?: number;
}

export const ELEMENT_EFFECTS: Record<Element, ElementEffect> = {
  fire: {
    element: 'fire',
    name: 'Burn',
    description: 'Burn 3/s for 3s',
    damageBonus: 0,
    attackSpeedBonus: 0,
    rangeBonus: 0,
    dotType: 'burn',
    dotDps: 3,
    dotDuration: 3000,
  },
  water: {
    element: 'water',
    name: 'Slow',
    description: 'Slow 25% for 2s',
    damageBonus: 0,
    attackSpeedBonus: 0,
    rangeBonus: 0,
    slowPercent: 25,
    slowDuration: 2000,
  },
  earth: {
    element: 'earth',
    name: 'Power',
    description: '+40% damage',
    damageBonus: 0.4,
    attackSpeedBonus: 0,
    rangeBonus: 0,
  },
  wind: {
    element: 'wind',
    name: 'Speed',
    description: '+30% attack speed',
    damageBonus: 0,
    attackSpeedBonus: 0.3,
    rangeBonus: 0,
  },
  light: {
    element: 'light',
    name: 'Reveal',
    description: '+1 range',
    damageBonus: 0,
    attackSpeedBonus: 0,
    rangeBonus: 1,
  },
  dark: {
    element: 'dark',
    name: 'Poison',
    description: 'Poison 4/s for 3s',
    damageBonus: 0,
    attackSpeedBonus: 0,
    rangeBonus: 0,
    dotType: 'poison',
    dotDps: 4,
    dotDuration: 3000,
  },
};

// ── Combo Names ─────────────────────────────────────────────
// Keys are sorted element arrays joined with '+' (e.g. 'earth+fire', 'dark+fire+water')

export const COMBO_NAMES: Record<string, string> = {
  // T2 — 15 dual combos
  'fire+water': 'Steam',
  'earth+fire': 'Magma',
  'fire+wind': 'Blaze',
  'fire+light': 'Solar',
  'dark+fire': 'Hellfire',
  'earth+water': 'Mud',
  'water+wind': 'Storm',
  'light+water': 'Prism',
  'dark+water': 'Abyssal',
  'earth+wind': 'Gale',
  'earth+light': 'Radiant',
  'dark+earth': 'Shadow',
  'light+wind': 'Zephyr',
  'dark+wind': 'Phantom',
  'dark+light': 'Eclipse',

  // T3 — 20 triple combos
  'earth+fire+water': 'Geyser',
  'fire+water+wind': 'Typhoon',
  'fire+light+water': 'Aurora',
  'dark+fire+water': 'Voodoo',
  'earth+fire+wind': 'Sandstorm',
  'earth+fire+light': 'Forge',
  'dark+earth+fire': 'Infernal',
  'fire+light+wind': 'Phoenix',
  'dark+fire+wind': 'Wraith',
  'dark+fire+light': 'Purgatory',
  'earth+water+wind': 'Monsoon',
  'earth+light+water': 'Crystal',
  'dark+earth+water': 'Swamp',
  'light+water+wind': 'Rainbow',
  'dark+water+wind': 'Maelstrom',
  'dark+light+water': 'Leviathan',
  'earth+light+wind': 'Titan',
  'dark+earth+wind': 'Decay',
  'dark+earth+light': 'Obsidian',
  'dark+light+wind': 'Specter',
};

/** Get combo name for a set of elements (order-independent) */
export function getComboName(elements: Element[], baseName: string): string {
  if (elements.length === 0) return baseName;
  if (elements.length === 1) {
    const el = elements[0];
    return `${el.charAt(0).toUpperCase() + el.slice(1)} ${baseName}`;
  }
  const key = [...elements].sort().join('+');
  const combo = COMBO_NAMES[key];
  if (combo) return `${combo} ${baseName}`;
  // Fallback
  return elements.map(e => e.charAt(0).toUpperCase() + e.slice(1)).join('-') + ' ' + baseName;
}

// ── Dynamic Tower Stats Calculation ──────────────────────

export interface TowerStats {
  damage: number;
  attackSpeed: number;
  range: number;
  splashRadius?: number;
  effects: ElementEffect[];
  displayName: string;
}

/**
 * Calculate final tower stats based on base tower + applied elements + total fragments bought
 */
export function getTowerStats(
  baseDef: TowerDef,
  appliedElements: Element[],
  totalBought: Record<Element, number>
): TowerStats {
  let damage = baseDef.damage;
  let attackSpeed = baseDef.attackSpeed;
  let range = baseDef.range;
  const effects: ElementEffect[] = [];

  for (const element of appliedElements) {
    const effect = ELEMENT_EFFECTS[element];
    const bought = totalBought[element] || 0;

    // Element-specific bonuses
    damage += baseDef.damage * effect.damageBonus;
    attackSpeed += baseDef.attackSpeed * effect.attackSpeedBonus;
    range += effect.rangeBonus;

    // Global element investment damage bonus
    const cappedPoints = Math.min(bought, 3);
    const pointsBonus = ELEMENT_DAMAGE_BONUS[cappedPoints] || 0;
    damage += baseDef.damage * pointsBonus;

    effects.push(effect);
  }

  return {
    damage: Math.round(damage * 10) / 10,
    attackSpeed: Math.round(attackSpeed * 100) / 100,
    range,
    splashRadius: baseDef.splashRadius,
    effects,
    displayName: getComboName(appliedElements, baseDef.name),
  };
}

/**
 * Preview stats if a new element were added (for UI comparison)
 */
export function previewUpgradeStats(
  baseDef: TowerDef,
  currentElements: Element[],
  newElement: Element,
  totalBought: Record<Element, number>
): { before: TowerStats; after: TowerStats } {
  const before = getTowerStats(baseDef, currentElements, totalBought);
  const after = getTowerStats(baseDef, [...currentElements, newElement], totalBought);
  return { before, after };
}

// ── Upgrade cost helper ─────────────────────────────────────

export function getUpgradeCost(currentElementCount: number): number {
  if (currentElementCount === 0) return 3;  // T1
  if (currentElementCount === 1) return 5;  // T2
  if (currentElementCount === 2) return 8;  // T3
  return 0; // already maxed
}

/** Check if player can upgrade tower with given element */
export function canUpgradeTower(
  towerElements: Element[],
  element: Element,
  playerFragments: Record<Element, number>,
  playerGold: number,
  totalBought: Record<Element, number>
): { canUpgrade: boolean; reason?: string; cost: number } {
  const count = towerElements.length;
  if (count >= 3) return { canUpgrade: false, reason: 'Max 3 elements', cost: 0 };
  if (towerElements.includes(element)) return { canUpgrade: false, reason: 'Already applied', cost: 0 };
  if ((playerFragments[element] || 0) < 1) return { canUpgrade: false, reason: 'No fragment', cost: 0 };

  const cost = getUpgradeCost(count);

  // T3 requires 2+ points in ALL elements on the tower (including the new one)
  if (count === 2) {
    const allElements = [...towerElements, element];
    for (const el of allElements) {
      if ((totalBought[el] || 0) < 2) {
        return { canUpgrade: false, reason: `Need 2pts in ${el}`, cost };
      }
    }
  }

  if (playerGold < cost) return { canUpgrade: false, reason: `Need ${cost}g`, cost };

  return { canUpgrade: true, cost };
}

// ── Legacy Compatibility ──────────────────────────────────

export const ALL_TOWERS: TowerDef[] = [...BASE_TOWERS];

export const TOWER_MAP: Record<string, TowerDef> = Object.fromEntries(
  ALL_TOWERS.map((t) => [t.id, t])
);

// ── Hexes ───────────────────────────────────────────────

export const HEXES = [
  { id: 'haste' as const, name: 'Haste', tier: 1 as const, cost: 3, description: 'Mobs gain +30% move speed this round' },
  { id: 'fog' as const, name: 'Fog of War', tier: 1 as const, cost: 4, description: '3 random towers hidden for 5s' },
  { id: 'reinforcements' as const, name: 'Reinforcements', tier: 1 as const, cost: 5, description: '+5 bonus mobs added to the wave' },
  { id: 'siege_golem' as const, name: 'Siege Golem', tier: 2 as const, cost: 8, description: '1 tanky mob that attacks towers' },
  { id: 'corruption' as const, name: 'Corruption', tier: 2 as const, cost: 9, description: '1 random tower loses element this round' },
  { id: 'mirage' as const, name: 'Mirage', tier: 2 as const, cost: 10, description: 'Mobs invisible for 3s mid-path' },
  { id: 'earthquake' as const, name: 'Earthquake', tier: 3 as const, cost: 15, description: 'All towers disabled for 2s at wave start' },
  { id: 'void_rift' as const, name: 'Void Rift', tier: 3 as const, cost: 18, description: 'Second entry point opens this round' },
  { id: 'leech' as const, name: 'Leech', tier: 3 as const, cost: 20, description: 'Leaked mobs heal caster for 5 HP each' },
];

export const HEX_MAP: Record<string, (typeof HEXES)[number]> = Object.fromEntries(
  HEXES.map((h) => [h.id, h])
);
