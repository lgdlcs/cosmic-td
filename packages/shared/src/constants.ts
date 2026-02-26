import type { GameConfig, PvPUnitDef } from './types.js';

// ── Game Config ─────────────────────────────────────────

export const GRID_SIZE = 16;
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 1;
export const STARTING_HP = 100;
export const STARTING_CREDITS = 200;

export const DEFAULT_GAME_CONFIG: GameConfig = {
  startingCredits: STARTING_CREDITS,
  startingHp: STARTING_HP,
};

export const TOTAL_ROUNDS = 30;

// ── Timing ──────────────────────────────────────────────

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const MOB_SYNC_INTERVAL = 3;
export const PREP_PHASE_DURATION = 30;
export const FIRST_PREP_PHASE_DURATION = 45;
export const BOSS_SELECT_DURATION = 10;

// ── Economy ─────────────────────────────────────────────

export const BASE_INCOME = 50; // credits per round
export const KILL_REWARD = 2;  // credits per mob killed
export const BOSS_KILL_REWARD = 20;

// ── Boss Rounds ─────────────────────────────────────────

export const BOSS_ROUND_INTERVAL = 5; // every 5 rounds
export const BOSS_DAMAGE_PER_PASS = 5; // HP damage when boss loops

// ── Sell ─────────────────────────────────────────────────

export const SELL_REFUND_RATIO = 0.7;

// ── Element Tower Credit Value (for sell calculation) ───

export const ELEMENT_CREDIT_VALUE = 50; // 1 element = 50 credits equivalent for sell calc

// ── Player Colors ───────────────────────────────────────

export const PLAYER_COLOR_HEX = {
  blue: '#4A90D9',
  red: '#D94A4A',
  green: '#4AD97A',
  orange: '#D9A04A',
} as const;

// ── Mob Scaling ─────────────────────────────────────────

export const MOB_BASE_HP = 60;
export const MOB_HP_SCALE = 1.12;
export const MOB_COUNT_BASE = 5;
export const MOB_COUNT_SCALE = 0.4;
export const BOSS_HP_MULT = 8;

export const RUNNER_SPEED_MULT = 1.8;
export const RUNNER_HP_MULT = 0.6;
export const TANK_SPEED_MULT = 0.5;
export const TANK_HP_MULT = 2.2;
export const SWARM_COUNT_MULT = 2.5;
export const SWARM_HP_MULT = 0.4;

// ── PvP Shop Units ──────────────────────────────────────

export const PVP_UNIT_DEFS: PvPUnitDef[] = [
  {
    id: 'pvp_grunt',
    name: 'Grunt',
    cost: 50,
    incomeBonus: 1,
    hp_mult: 1.5,
    speed_mult: 1.0,
    description: 'Standard unit. +1 income/round.',
  },
  {
    id: 'pvp_runner',
    name: 'Runner',
    cost: 75,
    incomeBonus: 1,
    hp_mult: 0.8,
    speed_mult: 1.8,
    description: 'Fast but fragile. +1 income/round.',
  },
  {
    id: 'pvp_tank',
    name: 'Tank',
    cost: 100,
    incomeBonus: 2,
    hp_mult: 3.0,
    speed_mult: 0.5,
    description: 'Massive HP, slow. +2 income/round.',
  },
];

export const PVP_UNIT_MAP: Record<string, PvPUnitDef> = Object.fromEntries(
  PVP_UNIT_DEFS.map(u => [u.id, u])
);
