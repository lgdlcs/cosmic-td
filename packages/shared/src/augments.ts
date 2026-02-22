// ── Augment System ──────────────────────────────────────

import type { Element } from './elements.js';

export type AugmentEffect =
  | { type: 'element'; element: Element }
  | { type: 'zone'; element: 'solar'; dps: number; radius: number }
  | { type: 'zone'; element: 'cryo'; slowPercent: number; radius: number }
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
  | { type: 'zoneMultiplier'; element: 'solar'; multiplier: number }
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
    id: 'ELEM_FIRE', name: '☀️ Solar Element',
    description: 'Blasters: plasma burn DoT (3 dps/2s). Railguns: solar flare AoE (2s). Strong vs Bio, weak vs Cryo.',
    icon: '☀️', tier: 1, category: 'element',
    effect: { type: 'element', element: 'solar' },
  },
  {
    id: 'ELEM_WATER', name: '🧊 Cryo Element',
    description: 'Blasters: freeze ray slow 20%/1s. Railguns: ice nova zone 25% slow. Strong vs Solar, weak vs Bio.',
    icon: '🧊', tier: 1, category: 'element',
    effect: { type: 'element', element: 'cryo' },
  },
  {
    id: 'ELEM_EARTH', name: '🪨 Asteroid Element',
    description: 'Blasters: 10% shrapnel stun (0.5s). Railguns: +30% meteor splash. Strong vs Photon, weak vs Void.',
    icon: '🪨', tier: 1, category: 'element',
    effect: { type: 'element', element: 'asteroid' },
  },
  {
    id: 'ELEM_DARK', name: '🕳️ Void Element',
    description: 'Blasters: entropy poison DoT (2 dps/3s, stacks). Railguns: gravity well -15% armor. Strong vs Cryo, weak vs Photon.',
    icon: '🕳️', tier: 1, category: 'element',
    effect: { type: 'element', element: 'void' },
  },
  {
    id: 'ELEM_LIGHT', name: '⚡ Photon Element',
    description: 'Blasters: +5% dmg per consecutive hit (photon cascade). Railguns: beam split to 1 nearby (30%). Strong vs Void, weak vs Asteroid.',
    icon: '⚡', tier: 1, category: 'element',
    effect: { type: 'element', element: 'photon' },
  },
  {
    id: 'ELEM_NATURE', name: '🧬 Bio Element',
    description: 'Blasters: spore entangle (slow 30%/0.5s). Railguns: spawn bio-turret (50% dmg/3s). Strong vs Cryo, weak vs Solar.',
    icon: '🧬', tier: 1, category: 'element',
    effect: { type: 'element', element: 'bio' },
  },
  {
    id: 'ELEM_WIND', name: '🌀 Nebula Element',
    description: 'Blasters: ionized shots +25% attack speed. Railguns: shockwave knockback. Strong vs Asteroid, weak vs Bio.',
    icon: '🌀', tier: 1, category: 'element',
    effect: { type: 'element', element: 'nebula' },
  },

  // ── Zone Augments ─────────────────────────────────────
  {
    id: 'FIRE_ZONE', name: '☀️ Solar Flare Zone',
    description: 'Deploy a solar flare zone that deals 5 dps to targets passing through',
    icon: '☀️', tier: 1, category: 'zone',
    effect: { type: 'zone', element: 'solar', dps: 5, radius: 1.5 },
  },
  {
    id: 'WATER_ZONE', name: '🧊 Cryo Field',
    description: 'Deploy a cryo field that slows targets by 30%',
    icon: '🧊', tier: 1, category: 'zone',
    effect: { type: 'zone', element: 'cryo', slowPercent: 30, radius: 1.5 },
  },
  {
    id: 'ZONE_NEUTRAL', name: '⬜ Dampening Field',
    description: 'Deploy a field that slows targets by 10% (upgrades with your element)',
    icon: '⬜', tier: 1, category: 'zone',
    effect: { type: 'zone', element: 'neutral', slowPercent: 10, radius: 1.5 },
  },

  // ── Passive Augments ──────────────────────────────────
  {
    id: 'INCOME_BOOST', name: '💰 Mining Efficiency',
    description: 'Mining efficiency upgrade: +3 credits per round',
    icon: '💰', tier: 1, category: 'passive',
    effect: { type: 'passive', bonusGold: 3 },
  },
  {
    id: 'PVP_BOOST', name: '👹 Warp Commander',
    description: 'Warp gate reinforcements: 25% stronger alien mobs',
    icon: '👹', tier: 1, category: 'passive',
    effect: { type: 'passive', pvpMultiplier: 1.25 },
  },
  {
    id: 'ARROW_MASTERY', name: '🔫 Overcharged Cells',
    description: 'Blasters deal +20% damage',
    icon: '🔫', tier: 1, category: 'passive',
    effect: { type: 'towerBuff', towerType: 'arrow', damageMultiplier: 1.2 },
  },
  {
    id: 'CANNON_MASTERY', name: '💣 Expanded Payload',
    description: 'Railgun splash radius +50%',
    icon: '💣', tier: 1, category: 'passive',
    effect: { type: 'towerBuff', towerType: 'cannon', splashMultiplier: 1.5 },
  },

  // ── Tier 2 ────────────────────────────────────────────
  {
    id: 'WIND_BOOST', name: '🌀 Ion Thrusters',
    description: 'All towers fire 15% faster',
    icon: '🌀', tier: 2, category: 'passive',
    effect: { type: 'passive', attackSpeedMultiplier: 0.85 },
  },
  {
    id: 'EARTH_WALL', name: '🪨 Asteroid Barrier',
    description: 'Deploy a barrier that blocks a path tile (mobs reroute)',
    icon: '🪨', tier: 2, category: 'zone',
    effect: { type: 'wall' },
  },
  {
    id: 'GOLD_INTEREST', name: '💰 Quantum Investment',
    description: 'Interest cap increased to +8 (from +5)',
    icon: '💰', tier: 2, category: 'passive',
    effect: { type: 'passive', interestCap: 8 },
  },
  {
    id: 'DOUBLE_SEND', name: '👹👹 Swarm Protocol',
    description: 'Warp gates send 2 alien mobs instead of 1',
    icon: '👹', tier: 2, category: 'passive',
    effect: { type: 'passive', pvpDoubleCount: true },
  },

  // ── Tier 3 ────────────────────────────────────────────
  {
    id: 'FIRE_STORM', name: '☀️☀️ Solar Storm',
    description: 'All solar flare zones deal 3x damage',
    icon: '☀️', tier: 3, category: 'passive',
    effect: { type: 'zoneMultiplier', element: 'solar', multiplier: 3 },
  },
  {
    id: 'BLIZZARD', name: '🧊🧊 Deep Freeze',
    description: 'All targets permanently slowed 15% by cryo field',
    icon: '🧊', tier: 3, category: 'passive',
    effect: { type: 'passive', globalSlow: 0.15 },
  },
  {
    id: 'MEGA_INCOME', name: '💰💰 Hyperdrive Mining',
    description: 'Mining probes extract double credits',
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

/** Check if a round should offer augments (after boss rounds: 5,10,15,20,25,30) */
export function isAugmentRound(round: number): boolean {
  return round > 1 && round % 5 === 1; // rounds 6, 11, 16, 21, 26
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
