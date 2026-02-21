// ── Element Combo Tech Tree ─────────────────────────────

import type { Element } from './elements.js';

export type ComboEffectType =
  | 'dot_slow'        // PLASMA
  | 'impact_zone'     // METEOR
  | 'drain_speed'     // ECLIPSE
  | 'aoe_burst'       // SUPERNOVA
  | 'reduce_maxhp'    // RADIATION
  | 'passive_aura'    // CORONA
  | 'shatter'         // COMET
  | 'full_freeze'     // ABSOLUTE_ZERO
  | 'split_beam'      // PRISM
  | 'stack_freeze'    // CRYOGENICS
  | 'frost_zone'      // FROST_CLOUD
  | 'gravity_pull'    // BLACK_HOLE
  | 'ramp_damage'     // CRYSTAL
  | 'death_trap'      // FOSSIL
  | 'aoe_slow'        // DUST_STORM
  | 'percent_hp'      // ANTIMATTER
  | 'chain_damage'    // PARASITE
  | 'ignore_armor'    // DARK_MATTER
  | 'heal_towers'     // BIOLUMINESCENCE
  | 'cycle_element'   // AURORA
  | 'stacking_dot';   // SPORE_CLOUD

export interface ComboEffect {
  type: ComboEffectType;
  /** Multiplier or percentage value for the effect */
  value: number;
  /** Secondary value (e.g., duration, radius) */
  value2?: number;
}

export interface ElementCombo {
  id: string;
  name: string;
  elements: [Element, Element];
  color: string;
  colorHex: number;
  description: string;
  effect: ComboEffect;
}

export const COMBO_DEFS: ElementCombo[] = [
  // Solar combos
  {
    id: 'PLASMA', name: 'Plasma', elements: ['solar', 'cryo'], color: '#FF4488', colorHex: 0xFF4488,
    description: 'Ionized shots deal bonus damage over time + slow',
    effect: { type: 'dot_slow', value: 4, value2: 0.2 }, // 4 dps + 20% slow
  },
  {
    id: 'METEOR', name: 'Meteor', elements: ['solar', 'asteroid'], color: '#FF8800', colorHex: 0xFF8800,
    description: 'Attacks create burning impact zones',
    effect: { type: 'impact_zone', value: 6, value2: 1.5 }, // 6 dps in 1.5 radius
  },
  {
    id: 'ECLIPSE', name: 'Eclipse', elements: ['solar', 'void'], color: '#8B4500', colorHex: 0x8B4500,
    description: 'Attacks drain mob speed, gaining damage',
    effect: { type: 'drain_speed', value: 0.1, value2: 0.15 }, // 10% speed drain → 15% bonus dmg
  },
  {
    id: 'SUPERNOVA', name: 'Supernova', elements: ['solar', 'photon'], color: '#FFAA00', colorHex: 0xFFAA00,
    description: 'Massive AoE burst every 5th attack',
    effect: { type: 'aoe_burst', value: 3, value2: 2 }, // 3x damage, 2 radius
  },
  {
    id: 'RADIATION', name: 'Radiation', elements: ['solar', 'bio'], color: '#FF6633', colorHex: 0xFF6633,
    description: 'Attacks mutate mobs, reducing their max HP',
    effect: { type: 'reduce_maxhp', value: 0.03 }, // 3% max HP reduction per hit
  },
  {
    id: 'CORONA', name: 'Corona', elements: ['solar', 'nebula'], color: '#FF7799', colorHex: 0xFF7799,
    description: 'Aura that damages all nearby mobs passively',
    effect: { type: 'passive_aura', value: 3, value2: 2 }, // 3 dps, 2 radius
  },

  // Cryo combos
  {
    id: 'COMET', name: 'Comet', elements: ['cryo', 'asteroid'], color: '#4488AA', colorHex: 0x4488AA,
    description: 'Attacks shatter on impact, hitting nearby mobs',
    effect: { type: 'shatter', value: 0.4, value2: 1.5 }, // 40% dmg to mobs in 1.5 radius
  },
  {
    id: 'ABSOLUTE_ZERO', name: 'Absolute Zero', elements: ['cryo', 'void'], color: '#2244AA', colorHex: 0x2244AA,
    description: 'Chance to completely freeze mobs for 1s',
    effect: { type: 'full_freeze', value: 0.12, value2: 1000 }, // 12% chance, 1s
  },
  {
    id: 'PRISM', name: 'Prism', elements: ['cryo', 'photon'], color: '#88DDFF', colorHex: 0x88DDFF,
    description: 'Attacks split into 3 weaker beams',
    effect: { type: 'split_beam', value: 3, value2: 0.4 }, // 3 beams at 40% dmg each
  },
  {
    id: 'CRYOGENICS', name: 'Cryogenics', elements: ['cryo', 'bio'], color: '#00AA88', colorHex: 0x00AA88,
    description: 'Slow stacks, at 3 stacks mob is frozen',
    effect: { type: 'stack_freeze', value: 3, value2: 1500 }, // 3 stacks → 1.5s freeze
  },
  {
    id: 'FROST_CLOUD', name: 'Frost Cloud', elements: ['cryo', 'nebula'], color: '#7788CC', colorHex: 0x7788CC,
    description: 'Creates lingering frost zones on mob death',
    effect: { type: 'frost_zone', value: 0.3, value2: 3000 }, // 30% slow, 3s duration
  },

  // Asteroid combos
  {
    id: 'BLACK_HOLE', name: 'Black Hole', elements: ['asteroid', 'void'], color: '#330066', colorHex: 0x330066,
    description: 'Pulls mobs toward tower, slowing them',
    effect: { type: 'gravity_pull', value: 0.5, value2: 0.25 }, // pull speed, 25% slow
  },
  {
    id: 'CRYSTAL', name: 'Crystal', elements: ['asteroid', 'photon'], color: '#DDBB44', colorHex: 0xDDBB44,
    description: 'Attacks gain damage the longer they target same mob',
    effect: { type: 'ramp_damage', value: 0.08 }, // +8% per consecutive hit
  },
  {
    id: 'FOSSIL', name: 'Fossil', elements: ['asteroid', 'bio'], color: '#667744', colorHex: 0x667744,
    description: 'Killed mobs leave a trap that damages others',
    effect: { type: 'death_trap', value: 15, value2: 3000 }, // 15 dmg, 3s duration
  },
  {
    id: 'DUST_STORM', name: 'Dust Storm', elements: ['asteroid', 'nebula'], color: '#AA8866', colorHex: 0xAA8866,
    description: 'AoE attacks that reduce mob speed',
    effect: { type: 'aoe_slow', value: 0.35, value2: 1.5 }, // 35% slow, 1.5 radius
  },

  // Void combos
  {
    id: 'ANTIMATTER', name: 'Antimatter', elements: ['void', 'photon'], color: '#AA00FF', colorHex: 0xAA00FF,
    description: 'Attacks deal % of mob max HP as bonus damage',
    effect: { type: 'percent_hp', value: 0.03 }, // 3% max HP bonus
  },
  {
    id: 'PARASITE', name: 'Parasite', elements: ['void', 'bio'], color: '#440066', colorHex: 0x440066,
    description: 'Damage transfers between nearby mobs',
    effect: { type: 'chain_damage', value: 0.3, value2: 2 }, // 30% dmg chains, 2 radius
  },
  {
    id: 'DARK_MATTER', name: 'Dark Matter', elements: ['void', 'nebula'], color: '#553388', colorHex: 0x553388,
    description: 'Invisible attacks that ignore mob armor',
    effect: { type: 'ignore_armor', value: 1 }, // full armor ignore
  },

  // Photon combos
  {
    id: 'BIOLUMINESCENCE', name: 'Bioluminescence', elements: ['photon', 'bio'], color: '#66FF66', colorHex: 0x66FF66,
    description: 'Attacks heal nearby towers (restore ability cooldowns)',
    effect: { type: 'heal_towers', value: 0.1, value2: 2 }, // 10% cd reduction, 2 radius
  },
  {
    id: 'AURORA', name: 'Aurora', elements: ['photon', 'nebula'], color: '#FF66FF', colorHex: 0xFF66FF,
    description: 'Rainbow damage that cycles element, always hitting weakness',
    effect: { type: 'cycle_element', value: 2 }, // 2x multiplier (always strong)
  },

  // Bio combos
  {
    id: 'SPORE_CLOUD', name: 'Spore Cloud', elements: ['bio', 'nebula'], color: '#44AA66', colorHex: 0x44AA66,
    description: 'Attacks spread spores that deal increasing DoT',
    effect: { type: 'stacking_dot', value: 2, value2: 0.5 }, // 2 base dps, +0.5 per stack
  },
];

export const COMBO_MAP: Record<string, ElementCombo> = Object.fromEntries(
  COMBO_DEFS.map(c => [c.id, c])
);

/** Find combo for two elements (order doesn't matter) */
export function findCombo(a: Element, b: Element): ElementCombo | undefined {
  if (a === b) return undefined;
  return COMBO_DEFS.find(c =>
    (c.elements[0] === a && c.elements[1] === b) ||
    (c.elements[0] === b && c.elements[1] === a)
  );
}

/** Get the active combo for a player's element list */
export function getActiveCombo(elements: Element[]): ElementCombo | undefined {
  if (elements.length < 2) return undefined;
  // Use the last 2 distinct elements
  const last = elements[elements.length - 1];
  // Find the previous different element
  for (let i = elements.length - 2; i >= 0; i--) {
    if (elements[i] !== last) {
      return findCombo(elements[i], last);
    }
  }
  return undefined;
}
