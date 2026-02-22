import type { GameConfig, TowerType } from './types.js';

// ── Game Config ─────────────────────────────────────────

export const GRID_SIZE = 16;
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 1;
export const STARTING_HP = 100;
export const STARTING_GOLD = 50;

export const DEFAULT_GAME_CONFIG: GameConfig = {
  startingGold: 50,
  startingHp: 100,
};

export const SHOP_SLOTS = 5;
export const TOTAL_ROUNDS = 30;

// ── Timing ──────────────────────────────────────────────

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const MOB_SYNC_INTERVAL = 3;
export const SHOP_PHASE_DURATION = 30;
export const FIRST_SHOP_PHASE_DURATION = 45;
export const AUGMENT_PICK_DURATION = 15;

// ── Economy ─────────────────────────────────────────────

export const REROLL_COST = 2;
export const BASE_INCOME = 5;
export const INTEREST_PER_10G = 1;
export const MAX_INTEREST = 5;
export const CLEAN_BONUS = 3;
export const STREAK_BONUS = [0, 0, 1, 1, 2, 2, 3];

// ── Tower Costs ─────────────────────────────────────────

export const TOWER_COSTS: Record<string, number> = {
  arrow: 3,
  cannon: 5,
  income: 7,
  pvp: 6,
};

export const SELL_REFUND_RATIO = 0.7;

// ── Tower Colors ────────────────────────────────────────

export const TOWER_COLOR_HEX: Record<TowerType, string> = {
  arrow: '#4EA8DE',
  cannon: '#FF6B35',
  income: '#ffc107',
  pvp: '#9B5DE5',
};

// ── Player Colors ───────────────────────────────────────

export const PLAYER_COLOR_HEX = {
  blue: '#4A90D9',
  red: '#D94A4A',
  green: '#4AD97A',
  orange: '#D9A04A',
} as const;

// ── Mob Scaling ─────────────────────────────────────────

export const MOB_BASE_HP = 50;
export const MOB_HP_SCALE = 1.10;
export const MOB_COUNT_BASE = 5;
export const MOB_COUNT_SCALE = 0.4;
export const BOSS_ROUNDS = [5, 10, 15, 20, 25, 30];
export const BOSS_HP_MULT = 5;

export const RUNNER_SPEED_MULT = 1.8;
export const RUNNER_HP_MULT = 0.6;
export const TANK_SPEED_MULT = 0.5;
export const TANK_HP_MULT = 2.2;
export const SWARM_COUNT_MULT = 2.5;
export const SWARM_HP_MULT = 0.4;

// ── Kill Rewards ────────────────────────────────────────

export const KILL_REWARD_TIERS = [
  { maxRound: 15, gold: 1 },
  { maxRound: 30, gold: 2 },
];

// ── PvP Units (Feature 4) ───────────────────────────────

export const PVP_UNIT_DEFS = {
  pvp_grunt: { id: 'pvp_grunt', cost: 5, hp_mult: 1.0 },
  pvp_runner: { id: 'pvp_runner', cost: 8, hp_mult: 0.6, speed_mult: 1.8 },
  pvp_tank: { id: 'pvp_tank', cost: 12, hp_mult: 2.2, speed_mult: 0.5 },
} as const;
