import type { Element } from './types.js';

// ── Game Config ─────────────────────────────────────────

export const GRID_SIZE = 8;
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 1; // dev mode, set to 2 for production
export const STARTING_HP = 100;
export const STARTING_GOLD = 15;
export const STARTING_LEVEL = 1;
export const MAX_LEVEL = 6;
export const SHOP_SLOTS = 5;
export const BENCH_SIZE = 8;
export const TOTAL_ROUNDS = 30;

// ── Timing ──────────────────────────────────────────────

export const TICK_RATE = 20;                    // ticks per second
export const TICK_MS = 1000 / TICK_RATE;        // 50ms
export const MOB_SYNC_INTERVAL = 3;             // every 3 ticks = 150ms
export const SHOP_PHASE_DURATION = 20;          // seconds
export const FIRST_SHOP_PHASE_DURATION = 30;    // more time on round 1

// ── Economy ─────────────────────────────────────────────

export const REROLL_COST = 2;
export const XP_COST = 4;
export const XP_PER_PURCHASE = 4;
export const XP_PER_ROUND = 2;
export const BASE_INCOME = 5;
export const INTEREST_PER_10G = 1;
export const MAX_INTEREST = 5;
export const CLEAN_BONUS = 3;
export const STREAK_BONUS = [0, 0, 1, 1, 2, 2, 3]; // index = streak count, 3 max

// ── Level / XP Requirements ─────────────────────────────

export const XP_REQUIREMENTS: Record<number, number> = {
  1: 0,
  2: 4,
  3: 8,
  4: 12,
  5: 16,
  6: 24,
};

// ── Shop Odds (% chance per tier at each level) ─────────

export const SHOP_ODDS: Record<number, [number, number, number]> = {
  1: [100, 0, 0],
  2: [80, 20, 0],
  3: [60, 35, 5],
  4: [40, 45, 15],
  5: [25, 40, 35],
  6: [15, 30, 55],
};

// ── Tower Pool Sizes ────────────────────────────────────

export const POOL_SIZE_T1 = 30;
export const POOL_SIZE_T2 = 15;
export const POOL_SIZE_T3 = 8;

// ── Tower Costs ─────────────────────────────────────────

export const TOWER_COST = { 1: 3, 2: 4, 3: 5 } as const;
export const SELL_REFUND_RATIO = 0.7; // 70% of cost back

// ── Fusion ──────────────────────────────────────────────

export const FUSION_COUNT = 3;                  // 3 copies → star up
export const STAR_DAMAGE_MULT = [1.0, 1.5, 2.0]; // base, ★, ★★

// ── Synergy Bonuses ─────────────────────────────────────

export const SYNERGY_THRESHOLDS = [
  { count: 2, bonus: 0.10 },  // +10% attack speed
  { count: 3, bonus: 0.20 },  // +20% damage
  { count: 4, bonus: 0.30 },  // +30% damage + special proc
];

// ── Element Colors (hex codes for rendering) ────────────

export const ELEMENT_COLORS: Record<Element, string> = {
  fire: '#FF6B35',
  water: '#4EA8DE',
  earth: '#8B7355',
  wind: '#A8E6CF',
  light: '#FFD93D',
  dark: '#9B5DE5',
};

export const ELEMENT_SYMBOLS: Record<Element, string> = {
  fire: '🔥',
  water: '💧',
  earth: '🌍',
  wind: '💨',
  light: '☀️',
  dark: '🌑',
};

// ── Player Colors ───────────────────────────────────────

export const PLAYER_COLOR_HEX = {
  blue: '#4A90D9',
  red: '#D94A4A',
  green: '#4AD97A',
  orange: '#D9A04A',
} as const;

// ── Mob Scaling ─────────────────────────────────────────

export const MOB_BASE_HP = 60;
export const MOB_HP_SCALE = 1.15;              // HP multiplier per round (moins agressif)
export const MOB_COUNT_BASE = 6;
export const MOB_COUNT_SCALE = 0.3;            // +0.3 mobs per round (floored)
export const BOSS_ROUNDS = [5, 10, 15, 20, 25, 30];
export const BOSS_HP_MULT = 6;

// ── Mob Types & Variants ────────────────────────────────

export const RUNNER_SPEED_MULT = 1.8;          // Fast, low HP
export const RUNNER_HP_MULT = 0.6;
export const TANK_SPEED_MULT = 0.5;            // Slow, high HP  
export const TANK_HP_MULT = 2.2;
export const SWARM_COUNT_MULT = 2.5;           // Many small mobs
export const SWARM_HP_MULT = 0.4;

// ── Kill Rewards by Round Tier ──────────────────────────

export const KILL_REWARD_TIERS = [
  { maxRound: 10, gold: 1 },    // Rounds 1-10: +1g per kill
  { maxRound: 20, gold: 2 },    // Rounds 11-20: +2g per kill  
  { maxRound: 30, gold: 3 },    // Rounds 21-30: +3g per kill
];
