// ── Augment System ──────────────────────────────────────

import type { Element } from './elements.js';

export type AugmentEffect =
  | { type: 'element'; element: Element }
  | { type: 'zone'; element: 'fire'; dps: number; radius: number }
  | { type: 'zone'; element: 'water'; slowPercent: number; radius: number }
  | { type: 'zone'; element: 'neutral'; slowPercent: number; radius: number }
  | { type: 'passive'; bonusGold: number }
  | { type: 'passive'; pvpMultiplier: number }
  | { type: 'passive'; attackSpeedMultiplier: number }
  | { type: 'passive'; interestCap: number }
  | { type: 'passive'; globalSlow: number }
  | { type: 'passive'; pvpDoubleCount: boolean }
  | { type: 'towerBuff'; towerType: 'arrow'; damageMultiplier: number }
  | { type: 'towerBuff'; towerType: 'cannon'; splashMultiplier: number }
  | { type: 'towerBuff'; towerType: 'income'; incomeMultiplier: number }
  | { type: 'zoneMultiplier'; element: 'fire'; multiplier: number }
  | { type: 'wall' };

export type AugmentCategory = 'element' | 'zone' | 'passive';

export interface Augment {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 1 | 2 | 3;
  category: AugmentCategory;
  effect: AugmentEffect;
}

export const AUGMENT_POOL: Augment[] = [
  // ── Element Augments (Tier 1+) ────────────────────────
  {
    id: 'ELEM_FIRE', name: '🔥 Fire Element',
    description: 'Arrows: burn DoT (3 dps/2s). Cannons: fire patch (2s). Strong vs Nature, weak vs Water.',
    icon: '🔥', tier: 1, category: 'element',
    effect: { type: 'element', element: 'fire' },
  },
  {
    id: 'ELEM_WATER', name: '💧 Water Element',
    description: 'Arrows: slow 20%/1s. Cannons: frost zone 25% slow. Strong vs Fire, weak vs Nature.',
    icon: '💧', tier: 1, category: 'element',
    effect: { type: 'element', element: 'water' },
  },
  {
    id: 'ELEM_EARTH', name: '🌍 Earth Element',
    description: 'Arrows: 10% stun (0.5s). Cannons: +30% splash. Strong vs Light, weak vs Dark.',
    icon: '🌍', tier: 1, category: 'element',
    effect: { type: 'element', element: 'earth' },
  },
  {
    id: 'ELEM_DARK', name: '🌑 Dark Element',
    description: 'Arrows: poison DoT (2 dps/3s, stacks). Cannons: -15% armor. Strong vs Water, weak vs Light.',
    icon: '🌑', tier: 1, category: 'element',
    effect: { type: 'element', element: 'dark' },
  },
  {
    id: 'ELEM_LIGHT', name: '☀️ Light Element',
    description: 'Arrows: +5% dmg per consecutive hit. Cannons: chain to 1 nearby (30%). Strong vs Dark, weak vs Earth.',
    icon: '☀️', tier: 1, category: 'element',
    effect: { type: 'element', element: 'light' },
  },
  {
    id: 'ELEM_NATURE', name: '🌿 Nature Element',
    description: 'Arrows: entangle (slow 30%/0.5s). Cannons: spawn temp turret (50% dmg/3s). Strong vs Water, weak vs Fire.',
    icon: '🌿', tier: 1, category: 'element',
    effect: { type: 'element', element: 'nature' },
  },
  {
    id: 'ELEM_WIND', name: '💨 Wind Element',
    description: 'Arrows: +25% attack speed. Cannons: knockback mobs. Strong vs Earth, weak vs Nature.',
    icon: '💨', tier: 1, category: 'element',
    effect: { type: 'element', element: 'wind' },
  },

  // ── Zone Augments ─────────────────────────────────────
  {
    id: 'FIRE_ZONE', name: '🔥 Fire Zone',
    description: 'Place a burning area that deals 5 dps to mobs passing through',
    icon: '🔥', tier: 1, category: 'zone',
    effect: { type: 'zone', element: 'fire', dps: 5, radius: 1.5 },
  },
  {
    id: 'WATER_ZONE', name: '💧 Frost Field',
    description: 'Place a freezing area that slows mobs by 30%',
    icon: '💧', tier: 1, category: 'zone',
    effect: { type: 'zone', element: 'water', slowPercent: 30, radius: 1.5 },
  },
  {
    id: 'ZONE_NEUTRAL', name: '⬜ Slow Zone',
    description: 'Place a zone that slows mobs by 10% (upgrades with your element)',
    icon: '⬜', tier: 1, category: 'zone',
    effect: { type: 'zone', element: 'neutral', slowPercent: 10, radius: 1.5 },
  },

  // ── Passive Augments ──────────────────────────────────
  {
    id: 'INCOME_BOOST', name: '💰 Tax Collector',
    description: '+3 gold per round',
    icon: '💰', tier: 1, category: 'passive',
    effect: { type: 'passive', bonusGold: 3 },
  },
  {
    id: 'PVP_BOOST', name: '👹 War Chief',
    description: 'PvP monsters send 25% stronger mobs',
    icon: '👹', tier: 1, category: 'passive',
    effect: { type: 'passive', pvpMultiplier: 1.25 },
  },
  {
    id: 'ARROW_MASTERY', name: '🏹 Sharp Tips',
    description: 'Arrow towers deal +20% damage',
    icon: '🏹', tier: 1, category: 'passive',
    effect: { type: 'towerBuff', towerType: 'arrow', damageMultiplier: 1.2 },
  },
  {
    id: 'CANNON_MASTERY', name: '💣 Big Bombs',
    description: 'Cannon splash radius +50%',
    icon: '💣', tier: 1, category: 'passive',
    effect: { type: 'towerBuff', towerType: 'cannon', splashMultiplier: 1.5 },
  },

  // ── Tier 2 ────────────────────────────────────────────
  {
    id: 'WIND_BOOST', name: '💨 Tailwind',
    description: 'All towers attack 15% faster',
    icon: '💨', tier: 2, category: 'passive',
    effect: { type: 'passive', attackSpeedMultiplier: 0.85 },
  },
  {
    id: 'EARTH_WALL', name: '🌍 Earth Wall',
    description: 'Place a wall that blocks a path tile (mobs reroute)',
    icon: '🌍', tier: 2, category: 'zone',
    effect: { type: 'wall' },
  },
  {
    id: 'GOLD_INTEREST', name: '💰 Investment',
    description: 'Interest cap increased to +8 (from +5)',
    icon: '💰', tier: 2, category: 'passive',
    effect: { type: 'passive', interestCap: 8 },
  },
  {
    id: 'DOUBLE_SEND', name: '👹👹 Horde',
    description: 'PvP monsters send 2 mobs instead of 1',
    icon: '👹', tier: 2, category: 'passive',
    effect: { type: 'passive', pvpDoubleCount: true },
  },

  // ── Tier 3 ────────────────────────────────────────────
  {
    id: 'FIRE_STORM', name: '🔥🔥 Inferno',
    description: 'All fire zones deal 3x damage',
    icon: '🔥', tier: 3, category: 'passive',
    effect: { type: 'zoneMultiplier', element: 'fire', multiplier: 3 },
  },
  {
    id: 'BLIZZARD', name: '💧💧 Blizzard',
    description: 'All mobs permanently slowed 15%',
    icon: '💧', tier: 3, category: 'passive',
    effect: { type: 'passive', globalSlow: 0.15 },
  },
  {
    id: 'MEGA_INCOME', name: '💰💰 Midas Touch',
    description: 'Income towers generate double gold',
    icon: '💰', tier: 3, category: 'passive',
    effect: { type: 'towerBuff', towerType: 'income', incomeMultiplier: 2 },
  },
];

/** Get augment tier for a given round */
export function getAugmentTier(round: number): 1 | 2 | 3 {
  if (round >= 24) return 3;
  if (round >= 12) return 2;
  return 1;
}

/** Check if a round should offer augments */
export function isAugmentRound(round: number): boolean {
  return round >= 3 && round % 3 === 0;
}

/** Get 3 random augments of appropriate tier, always including at least 1 element */
export function generateAugmentChoices(round: number, pickedIds: string[]): Augment[] {
  const tier = getAugmentTier(round);
  const available = AUGMENT_POOL.filter(a => a.tier <= tier && !pickedIds.includes(a.id));
  
  const elements = available.filter(a => a.category === 'element');
  const others = available.filter(a => a.category !== 'element');
  
  const choices: Augment[] = [];
  
  // Guarantee at least 1 element if available
  if (elements.length > 0) {
    const shuffledElem = [...elements].sort(() => Math.random() - 0.5);
    choices.push(shuffledElem[0]);
  }
  
  // Fill remaining slots from mixed pool
  const remaining = available.filter(a => !choices.includes(a));
  const shuffled = [...remaining].sort(() => Math.random() - 0.5);
  while (choices.length < 3 && shuffled.length > 0) {
    choices.push(shuffled.shift()!);
  }
  
  // Shuffle final order
  return choices.sort(() => Math.random() - 0.5);
}
