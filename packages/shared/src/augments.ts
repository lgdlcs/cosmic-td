// ── Augment System ──────────────────────────────────────

export type AugmentEffect =
  | { type: 'zone'; element: 'fire'; dps: number; radius: number }
  | { type: 'zone'; element: 'water'; slowPercent: number; radius: number }
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

export interface Augment {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 1 | 2 | 3;
  effect: AugmentEffect;
}

export const AUGMENT_POOL: Augment[] = [
  // ── Tier 1 (rounds 3, 6, 9) ──────────────────────────
  {
    id: 'FIRE_ZONE', name: '🔥 Fire Zone',
    description: 'Place a burning area that deals 5 dps to mobs passing through',
    icon: '🔥', tier: 1,
    effect: { type: 'zone', element: 'fire', dps: 5, radius: 1.5 },
  },
  {
    id: 'WATER_ZONE', name: '💧 Frost Field',
    description: 'Place a freezing area that slows mobs by 30%',
    icon: '💧', tier: 1,
    effect: { type: 'zone', element: 'water', slowPercent: 30, radius: 1.5 },
  },
  {
    id: 'INCOME_BOOST', name: '💰 Tax Collector',
    description: '+3 gold per round',
    icon: '💰', tier: 1,
    effect: { type: 'passive', bonusGold: 3 },
  },
  {
    id: 'PVP_BOOST', name: '👹 War Chief',
    description: 'PvP monsters send 25% stronger mobs',
    icon: '👹', tier: 1,
    effect: { type: 'passive', pvpMultiplier: 1.25 },
  },
  {
    id: 'ARROW_MASTERY', name: '🏹 Sharp Tips',
    description: 'Arrow towers deal +20% damage',
    icon: '🏹', tier: 1,
    effect: { type: 'towerBuff', towerType: 'arrow', damageMultiplier: 1.2 },
  },
  {
    id: 'CANNON_MASTERY', name: '💣 Big Bombs',
    description: 'Cannon splash radius +50%',
    icon: '💣', tier: 1,
    effect: { type: 'towerBuff', towerType: 'cannon', splashMultiplier: 1.5 },
  },

  // ── Tier 2 (rounds 12, 15, 18) ───────────────────────
  {
    id: 'WIND_BOOST', name: '💨 Tailwind',
    description: 'All towers attack 15% faster',
    icon: '💨', tier: 2,
    effect: { type: 'passive', attackSpeedMultiplier: 0.85 },
  },
  {
    id: 'EARTH_WALL', name: '🌍 Earth Wall',
    description: 'Place a wall that blocks a path tile (mobs reroute)',
    icon: '🌍', tier: 2,
    effect: { type: 'wall' },
  },
  {
    id: 'GOLD_INTEREST', name: '💰 Investment',
    description: 'Interest cap increased to +8 (from +5)',
    icon: '💰', tier: 2,
    effect: { type: 'passive', interestCap: 8 },
  },
  {
    id: 'DOUBLE_SEND', name: '👹👹 Horde',
    description: 'PvP monsters send 2 mobs instead of 1',
    icon: '👹', tier: 2,
    effect: { type: 'passive', pvpDoubleCount: true },
  },

  // ── Tier 3 (rounds 24, 27, 30) ───────────────────────
  {
    id: 'FIRE_STORM', name: '🔥🔥 Inferno',
    description: 'All fire zones deal 3x damage',
    icon: '🔥', tier: 3,
    effect: { type: 'zoneMultiplier', element: 'fire', multiplier: 3 },
  },
  {
    id: 'BLIZZARD', name: '💧💧 Blizzard',
    description: 'All mobs permanently slowed 15%',
    icon: '💧', tier: 3,
    effect: { type: 'passive', globalSlow: 0.15 },
  },
  {
    id: 'MEGA_INCOME', name: '💰💰 Midas Touch',
    description: 'Income towers generate double gold',
    icon: '💰', tier: 3,
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

/** Get 3 random augments of appropriate tier */
export function generateAugmentChoices(round: number, pickedIds: string[]): Augment[] {
  const tier = getAugmentTier(round);
  // Include current tier and below
  const available = AUGMENT_POOL.filter(a => a.tier <= tier && !pickedIds.includes(a.id));
  
  // Shuffle and pick 3
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}
