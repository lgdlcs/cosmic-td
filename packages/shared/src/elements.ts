import type { TowerDef, HexDef, Element } from './types.js';

// ── T1 Towers (Base Elements) ───────────────────────────

export const T1_TOWERS: TowerDef[] = [
  {
    id: 'fire_t1',
    name: 'Flame Spitter',
    elements: ['fire'],
    tier: 1,
    cost: 3,
    damage: 8,
    attackSpeed: 0.8,
    range: 2,
    splashRadius: 1,
    special: 'AoE splash damage',
  },
  {
    id: 'water_t1',
    name: 'Frost Fountain',
    elements: ['water'],
    tier: 1,
    cost: 3,
    damage: 5,
    attackSpeed: 1.0,
    range: 2.5,
    special: 'Slows target by 25% for 2s',
  },
  {
    id: 'earth_t1',
    name: 'Stone Sentinel',
    elements: ['earth'],
    tier: 1,
    cost: 3,
    damage: 14,
    attackSpeed: 0.4,
    range: 2,
    special: 'High single-target damage',
  },
  {
    id: 'wind_t1',
    name: 'Gale Archer',
    elements: ['wind'],
    tier: 1,
    cost: 3,
    damage: 4,
    attackSpeed: 1.6,
    range: 3,
    special: 'Fast attacks, long range',
  },
  {
    id: 'light_t1',
    name: 'Radiance Beacon',
    elements: ['light'],
    tier: 1,
    cost: 3,
    damage: 6,
    attackSpeed: 0.8,
    range: 2.5,
    special: 'Reveals invisible mobs in range, +10% damage aura to adjacent towers',
  },
  {
    id: 'dark_t1',
    name: 'Shadow Caster',
    elements: ['dark'],
    tier: 1,
    cost: 3,
    damage: 3,
    attackSpeed: 0.8,
    range: 2.5,
    special: 'Applies poison: 3 dps for 3s (stacks)',
  },
];

// ── T2 Towers (Dual Element Combos) ────────────────────

export const T2_TOWERS: TowerDef[] = [
  {
    id: 'steam_t2',
    name: 'Steam Engine',
    elements: ['fire', 'water'],
    tier: 2,
    cost: 4,
    damage: 15,
    attackSpeed: 1.0,
    range: 2.5,
    splashRadius: 1.5,
    special: 'AoE slow zone + tick damage',
  },
  {
    id: 'magma_t2',
    name: 'Magma Cannon',
    elements: ['fire', 'earth'],
    tier: 2,
    cost: 4,
    damage: 30,
    attackSpeed: 0.4,
    range: 2,
    special: 'Massive hit, leaves burning ground (5 dps, 2s)',
  },
  {
    id: 'inferno_t2',
    name: 'Inferno Tornado',
    elements: ['fire', 'wind'],
    tier: 2,
    cost: 4,
    damage: 10,
    attackSpeed: 1.5,
    range: 3,
    splashRadius: 1,
    special: 'Moving AoE that follows the path',
  },
  {
    id: 'solar_t2',
    name: 'Solar Flare',
    elements: ['fire', 'light'],
    tier: 2,
    cost: 4,
    damage: 18,
    attackSpeed: 0.8,
    range: 3,
    special: 'Burst damage, blinds target (50% slow for 1s)',
  },
  {
    id: 'hellfire_t2',
    name: 'Hellfire Pyre',
    elements: ['fire', 'dark'],
    tier: 2,
    cost: 4,
    damage: 8,
    attackSpeed: 1.2,
    range: 2.5,
    splashRadius: 1,
    special: 'AoE + stacking DoT (3 dps per stack, max 5)',
  },
  {
    id: 'mud_t2',
    name: 'Mudslide Trap',
    elements: ['water', 'earth'],
    tier: 2,
    cost: 4,
    damage: 5,
    attackSpeed: 0.8,
    range: 2,
    special: 'Creates slow zone on path (40% slow, 3s)',
  },
  {
    id: 'tsunami_t2',
    name: 'Tsunami Wave',
    elements: ['water', 'wind'],
    tier: 2,
    cost: 4,
    damage: 12,
    attackSpeed: 0.6,
    range: 3,
    special: 'Periodic knockback wave (pushes mobs back 1 cell)',
  },
  {
    id: 'purify_t2',
    name: 'Purify Spring',
    elements: ['water', 'light'],
    tier: 2,
    cost: 4,
    damage: 8,
    attackSpeed: 1.0,
    range: 3,
    special: 'Reveals invisible + heals adjacent towers (anti Siege Golem)',
  },
  {
    id: 'venom_t2',
    name: 'Venom Tide',
    elements: ['water', 'dark'],
    tier: 2,
    cost: 4,
    damage: 6,
    attackSpeed: 1.0,
    range: 2.5,
    special: 'Stacking poison (5 dps/stack). On kill, spreads to nearest mob',
  },
  {
    id: 'sandstorm_t2',
    name: 'Sandstorm Pillar',
    elements: ['earth', 'wind'],
    tier: 2,
    cost: 4,
    damage: 14,
    attackSpeed: 0.7,
    range: 3,
    special: '20% chance mobs in range miss a path step (stumble)',
  },
  {
    id: 'crystal_t2',
    name: 'Crystal Guardian',
    elements: ['earth', 'light'],
    tier: 2,
    cost: 4,
    damage: 10,
    attackSpeed: 0.8,
    range: 2,
    special: 'Shield aura: adjacent towers take 50% less from Siege Golem',
  },
  {
    id: 'grave_t2',
    name: 'Grave Monolith',
    elements: ['earth', 'dark'],
    tier: 2,
    cost: 4,
    damage: 16,
    attackSpeed: 0.6,
    range: 2,
    special: 'Killed mobs become blockers for 2s (other mobs path around)',
  },
  {
    id: 'lightning_t2',
    name: 'Lightning Spire',
    elements: ['wind', 'light'],
    tier: 2,
    cost: 4,
    damage: 9,
    attackSpeed: 1.5,
    range: 3.5,
    special: 'Chain lightning: bounces to 2 nearby mobs (50% damage each)',
  },
  {
    id: 'phantom_t2',
    name: 'Phantom Gust',
    elements: ['wind', 'dark'],
    tier: 2,
    cost: 4,
    damage: 7,
    attackSpeed: 1.8,
    range: 3,
    special: '10% chance to confuse mob (reverses direction for 1s)',
  },
  {
    id: 'eclipse_t2',
    name: 'Eclipse Tower',
    elements: ['light', 'dark'],
    tier: 2,
    cost: 4,
    damage: 14,
    attackSpeed: 1.0,
    range: 3,
    special: 'Alternates: even seconds = buff allies (+15% AS), odd = debuff mobs (-15% speed)',
  },
];

// ── All Towers ──────────────────────────────────────────

export const ALL_TOWERS: TowerDef[] = [...T1_TOWERS, ...T2_TOWERS];

export const TOWER_MAP: Record<string, TowerDef> = Object.fromEntries(
  ALL_TOWERS.map((t) => [t.id, t])
);

// ── Element Combo Lookup ────────────────────────────────

/** Get T2 tower for a pair of elements (order-independent) */
export function getComboTower(a: Element, b: Element): TowerDef | undefined {
  return T2_TOWERS.find(
    (t) =>
      t.elements.length === 2 &&
      t.elements.includes(a) &&
      t.elements.includes(b)
  );
}

// ── Hexes ───────────────────────────────────────────────

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
