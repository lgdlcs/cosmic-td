import type { TowerDef, HexDef, Element } from './types.js';
import { ELEMENT_DAMAGE_BONUS } from './constants.js';

// ── Base Towers (no elements) ─────────────────────────────

export const BASE_TOWERS: TowerDef[] = [
  {
    id: 'archer',
    name: 'Archer',
    elements: [],  // No base element
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
    elements: [],  // No base element
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
    elements: [],  // No base element
    tier: 1,
    cost: 5,
    damage: 8,
    attackSpeed: 1.0,
    range: 2.5,
    special: 'Moderate damage, can apply effects',
  },
];

// ── Element Crystal Definitions ────────────────────────────

export interface ElementCrystal {
  id: string;
  element: Element;
  name: string;
  cost: number;
}

export const ELEMENT_CRYSTALS: ElementCrystal[] = [
  { id: 'fire_crystal', element: 'fire', name: 'Fire Crystal', cost: 4 },
  { id: 'water_crystal', element: 'water', name: 'Water Crystal', cost: 4 },
  { id: 'earth_crystal', element: 'earth', name: 'Earth Crystal', cost: 4 },
  { id: 'wind_crystal', element: 'wind', name: 'Wind Crystal', cost: 4 },
  { id: 'light_crystal', element: 'light', name: 'Light Crystal', cost: 4 },
  { id: 'dark_crystal', element: 'dark', name: 'Dark Crystal', cost: 4 },
];

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
    description: 'Applies burning damage over time',
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
    description: 'Slows target movement',
    damageBonus: 0,
    attackSpeedBonus: 0,
    rangeBonus: 0,
    slowPercent: 25,
    slowDuration: 2000,
  },
  earth: {
    element: 'earth',
    name: 'Power',
    description: 'Bonus damage against single targets',
    damageBonus: 0.4, // +40% damage
    attackSpeedBonus: 0,
    rangeBonus: 0,
  },
  wind: {
    element: 'wind',
    name: 'Speed',
    description: 'Increased attack speed',
    damageBonus: 0,
    attackSpeedBonus: 0.3, // +30% attack speed
    rangeBonus: 0,
  },
  light: {
    element: 'light',
    name: 'Reveal',
    description: 'Extended range and reveals invisible mobs',
    damageBonus: 0,
    attackSpeedBonus: 0,
    rangeBonus: 1, // +1 cell range
  },
  dark: {
    element: 'dark',
    name: 'Poison',
    description: 'Applies stacking poison damage',
    damageBonus: 0,
    attackSpeedBonus: 0,
    rangeBonus: 0,
    dotType: 'poison',
    dotDps: 4,
    dotDuration: 3000,
  },
};

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
 * Calculate final tower stats based on base tower + applied elements + element points
 */
export function getTowerStats(
  baseDef: TowerDef, 
  appliedElements: Element[], 
  elementPoints: Record<Element, number>
): TowerStats {
  let damage = baseDef.damage;
  let attackSpeed = baseDef.attackSpeed;
  let range = baseDef.range;
  const effects: ElementEffect[] = [];
  
  // Apply element bonuses
  for (const element of appliedElements) {
    const effect = ELEMENT_EFFECTS[element];
    const points = elementPoints[element] || 0;
    
    // Element-specific bonuses
    damage += baseDef.damage * effect.damageBonus;
    attackSpeed += baseDef.attackSpeed * effect.attackSpeedBonus;
    range += effect.rangeBonus;
    
    // Global element points damage bonus
    const pointsBonus = ELEMENT_DAMAGE_BONUS[points] || 0;
    damage += baseDef.damage * pointsBonus;
    
    effects.push(effect);
  }
  
  // Generate display name
  let displayName = baseDef.name;
  if (appliedElements.length === 1) {
    const element = appliedElements[0];
    const elementName = element.charAt(0).toUpperCase() + element.slice(1);
    displayName = `${elementName} ${baseDef.name}`;
  } else if (appliedElements.length === 2) {
    const elem1 = appliedElements[0].charAt(0).toUpperCase() + appliedElements[0].slice(1);
    const elem2 = appliedElements[1].charAt(0).toUpperCase() + appliedElements[1].slice(1);
    displayName = `${elem1}-${elem2} ${baseDef.name}`;
  }
  
  return {
    damage: Math.round(damage * 10) / 10, // Round to 1 decimal
    attackSpeed: Math.round(attackSpeed * 100) / 100, // Round to 2 decimals
    range,
    splashRadius: baseDef.splashRadius,
    effects,
    displayName,
  };
}

// ── Legacy Compatibility ──────────────────────────────────

// Keep old towers array and map for compatibility with existing code
export const ALL_TOWERS: TowerDef[] = [...BASE_TOWERS];

export const TOWER_MAP: Record<string, TowerDef> = Object.fromEntries(
  ALL_TOWERS.map((t) => [t.id, t])
);

// ── Hexes (unchanged from original) ───────────────────────

export const HEXES: HexDef[] = [
  // Tier 1
  { id: 'haste', name: 'Haste', tier: 1, cost: 3, description: 'Mobs gain +30% move speed this round' },
  { id: 'fog', name: 'Fog of War', tier: 1, cost: 4, description: '3 random towers hidden for 5s' },
  { id: 'reinforcements', name: 'Reinforcements', tier: 1, cost: 5, description: '+5 bonus mobs added to the wave' },
  // Tier 2
  { id: 'siege_golem', name: 'Siege Golem', tier: 2, cost: 8, description: '1 tanky mob that attacks towers' },
  { id: 'corruption', name: 'Corruption', tier: 2, cost: 9, description: '1 random tower loses element this round' },
  { id: 'mirage', name: 'Mirage', tier: 2, cost: 10, description: 'Mobs invisible for 3s mid-path' },
  // Tier 3
  { id: 'earthquake', name: 'Earthquake', tier: 3, cost: 15, description: 'All towers disabled for 2s at wave start' },
  { id: 'void_rift', name: 'Void Rift', tier: 3, cost: 18, description: 'Second entry point opens this round' },
  { id: 'leech', name: 'Leech', tier: 3, cost: 20, description: 'Leaked mobs heal caster for 5 HP each' },
];

export const HEX_MAP: Record<string, HexDef> = Object.fromEntries(
  HEXES.map((h) => [h.id, h])
);