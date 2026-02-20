import type { Element, GameConfig } from './types.js';

// ── Game Config ─────────────────────────────────────────

export const GRID_SIZE = 16;
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 1; // dev/solo mode. Set to 2 for production
export const STARTING_HP = 100;
export const STARTING_GOLD = 50;

export const DEFAULT_GAME_CONFIG: GameConfig = {
  startingGold: 50,
  startingHp: 100,
  fragmentPoolSize: 12,
};
export const STARTING_LEVEL = 1;
export const MAX_LEVEL = 6;
export const SHOP_SLOTS = 5;
export const TOTAL_ROUNDS = 30;

// ── Timing ──────────────────────────────────────────────

export const TICK_RATE = 20;                    // ticks per second
export const TICK_MS = 1000 / TICK_RATE;        // 50ms
export const MOB_SYNC_INTERVAL = 3;             // every 3 ticks = 150ms
export const SHOP_PHASE_DURATION = 60;          // seconds between waves
export const FIRST_SHOP_PHASE_DURATION = 60;    // same for round 1

// ── Economy ─────────────────────────────────────────────

export const REROLL_COST = 2;
export const BASE_INCOME = 5;
export const INTEREST_PER_10G = 1;
export const MAX_INTEREST = 5;
export const CLEAN_BONUS = 3;
export const STREAK_BONUS = [0, 0, 1, 1, 2, 2, 3]; // index = streak count, 3 max

// ── Element System ──────────────────────────────────────

export const UPGRADE_COST_T1 = 3;                // Cost to apply first element
export const UPGRADE_COST_T2 = 5;                // Cost to apply second element
export const UPGRADE_COST_T3 = 8;                // Cost to apply third element
export const UPGRADE_POINTS_REQUIRED_T3 = 2;     // Each element on tower needs 2+ points for T3
export const ELEMENT_DAMAGE_BONUS = [0, 0, 0.15, 0.30]; // Damage bonus per element point (0-3)

// ── Fragment System ─────────────────────────────────────

export const FRAGMENT_POOL_SIZE = 12;            // fragments per element in shared pool
export const FRAGMENT_BASE_COST = 3;             // base cost of fragments
export const FRAGMENT_COST_SCALE = [3, 3, 4, 5, 6, 6, 6, 6, 6, 6, 6, 6]; // cost by totalBought index
export const SHOP_FRAGMENT_CHANCE = 0.6;         // 60% chance a shop slot contains a fragment
export const SHOP_TOWER_CHANCE = 0.4;            // 40% chance a shop slot contains a base tower

// ── Tower Costs ─────────────────────────────────────────

export const BASE_TOWER_COSTS = { archer: 3, cannon: 4, mage: 5 } as const;
export const SELL_REFUND_RATIO = 0.7; // 70% of cost back

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
