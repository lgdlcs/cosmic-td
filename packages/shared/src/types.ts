import type { Element } from './elements.js';
import type { ComboEffectType } from './combos.js';

// ── Core Enums ──────────────────────────────────────────

export type TowerType = 'blaster' | 'railgun';
export const TOWER_TYPES: TowerType[] = ['blaster', 'railgun'];

export type BaseTowerTier = 1 | 2 | 3 | '3+';
export type ElementTowerRank = 1 | 2 | 3; // rank 3 = pure tower

export type PlayerColor = 'blue' | 'red' | 'green' | 'orange';
export const PLAYER_COLORS: PlayerColor[] = ['blue', 'red', 'green', 'orange'];

export type GamePhase = 'lobby' | 'prep' | 'bossSelect' | 'bossFight' | 'combat' | 'gameOver';

// ── Grid ────────────────────────────────────────────────

export interface GridPos {
  row: number;
  col: number;
}

// ── Tower Definitions ───────────────────────────────────

export interface BaseTowerDef {
  id: string;
  name: string;
  towerType: TowerType;
  cost: number;
  /** Stats per tier: [T1, T2, T3] */
  tiers: {
    damage: number;
    attackSpeed: number;
    range: number;
    splashRadius?: number;
  }[];
  description: string;
  upgradeCosts: number[]; // cost to go T1→T2, T2→T3
  t3PlusBonus: string; // description of T3+ element bonus
}

export interface ElementTowerDef {
  id: string; // combo ID or 'MONO_<element>'
  name: string;
  elements: Element[]; // 1 for mono, 2 for combo
  comboId?: string; // links to COMBO_DEFS
  rank1Cost: Record<Element, number>; // elements needed for rank 1
  description: string;
}

// ── Tower Instances ─────────────────────────────────────

export interface BaseTowerInstance {
  instanceId: string;
  kind: 'base';
  towerType: TowerType;
  position: GridPos;
  tier: 1 | 2 | 3;
  t3PlusElement?: Element; // element applied to T3 tower
  totalInvested: number; // total credits spent (for sell calc)
}

export interface ElementTowerInstance {
  instanceId: string;
  kind: 'element';
  elementTowerId: string; // references ElementTowerDef.id
  position: GridPos;
  rank: ElementTowerRank;
  elements: Element[]; // which elements compose this tower
  isPure: boolean; // rank 3 pure tower
  totalInvested: number; // total element "value" for sell calc (in credits equivalent)
}

export type TowerInstance = BaseTowerInstance | ElementTowerInstance;

// ── Mob ─────────────────────────────────────────────────

export type MobType = 'grunt' | 'runner' | 'tank' | 'swarm' | 'flying' | 'boss' | 'pvp_grunt' | 'pvp_tank' | 'pvp_runner';

export interface MobEffect {
  type: 'slow' | 'poison' | 'burn' | 'freeze' | 'stun' | 'armorReduce';
  remaining: number;
  value: number;
}

export interface MobInstance {
  instanceId: string;
  defId: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  pathIndex: number;
  effects: MobEffect[];
  visible: boolean;
  element?: Element;
  armor?: number;
  isPvp?: boolean;
  isFlying?: boolean;
  isBoss?: boolean;
  bossElement?: Element; // which element this boss drops
}

// ── PvP Shop ────────────────────────────────────────────

export interface PvPUnitDef {
  id: string;
  name: string;
  cost: number;       // credits
  incomeBonus: number; // permanent +income per round
  hp_mult: number;
  speed_mult: number;
  description: string;
}

// ── Boss Round ──────────────────────────────────────────

export interface BossRoundState {
  active: boolean;
  element?: Element;       // chosen element
  bossHp?: number;
  bossMaxHp?: number;
  passes: number;          // how many times boss looped
  damagePerPass: number;
}

// ── Player ──────────────────────────────────────────────

export interface PlayerState {
  id: string;
  name: string;
  color: PlayerColor;
  hp: number;
  credits: number;
  income: number;          // base + pvp bonus income per round
  towers: TowerInstance[];
  elementInventory: Record<Element, number>; // element resources
  pureTowerSlot: string | null; // instanceId of active pure tower (max 1)
  alive: boolean;
  bossState: BossRoundState;
}

// ── Map ─────────────────────────────────────────────────

export interface GameMap {
  id: string;
  name: string;
  path: GridPos[];
  entry: GridPos;
  exit: GridPos;
}

// ── Game State ──────────────────────────────────────────

export interface GameState {
  phase: GamePhase;
  round: number;
  timer: number;
  players: PlayerState[];
  mapId: string;
  mobs: Record<string, MobInstance[]>;
  winner: string | null;
  isBossRound: boolean;
}

// ── Game Config (lobby settings) ────────────────────────

export interface GameConfig {
  startingCredits: number;
  startingHp: number;
}

// ── Network Messages ────────────────────────────────────

// Client → Server
export type ClientMsg =
  | { type: 'JOIN_LOBBY'; name: string; roomCode?: string }
  | { type: 'SET_CONFIG'; config: Partial<GameConfig> }
  | { type: 'READY' }
  | { type: 'BUY_BASE_TOWER'; towerType: TowerType; position: GridPos }
  | { type: 'UPGRADE_BASE_TOWER'; towerId: string }
  | { type: 'APPLY_T3_ELEMENT'; towerId: string; element: Element }
  | { type: 'BUY_ELEMENT_TOWER'; elements: Element[]; position: GridPos }
  | { type: 'UPGRADE_ELEMENT_TOWER'; towerId: string }
  | { type: 'SELL_TOWER'; instanceId: string }
  | { type: 'SELECT_BOSS_ELEMENT'; element: Element }
  | { type: 'BUY_PVP_UNIT'; unitId: string; targetPlayerId: string }
  | { type: 'DEV_START_COMBAT' }
  | { type: 'SET_SPEED'; speed: number }
  | { type: 'SET_COLOR'; color: PlayerColor };

// Server → Client
export type ServerMsg =
  | { type: 'YOUR_ID'; id: string }
  | { type: 'LOBBY_UPDATE'; players: LobbyPlayer[]; roomCode: string; config: GameConfig; isHost: boolean }
  | { type: 'GAME_START'; state: GameState; mapDef: GameMap }
  | { type: 'PHASE_CHANGE'; phase: GamePhase; round: number; timer: number }
  | { type: 'SPEED_CHANGE'; speed: number }
  | { type: 'STATE_UPDATE'; state: GameState }
  | { type: 'MOB_SYNC'; mobs: Record<string, MobInstance[]> }
  | { type: 'COMBAT_EVENTS'; playerId: string; attacks: CombatAttack[]; kills: CombatKill[]; leaks: string[] }
  | { type: 'MOB_LEAKED'; playerId: string; mobId: string; damage: number }
  | { type: 'TOWER_PLACED'; playerId: string; tower: TowerInstance }
  | { type: 'TOWER_UPGRADED'; playerId: string; towerId: string }
  | { type: 'TOWER_SOLD'; playerId: string; towerId: string; refund: number }
  | { type: 'BOSS_SELECT'; round: number }
  | { type: 'BOSS_SPAWNED'; playerId: string; element: Element }
  | { type: 'BOSS_KILLED'; playerId: string; element: Element }
  | { type: 'BOSS_PASS'; playerId: string; damage: number; passes: number }
  | { type: 'ELEMENT_GAINED'; playerId: string; element: Element; newCount: number }
  | { type: 'PVP_UNIT_SENT'; fromId: string; toId: string; unitId: string }
  | { type: 'PLAYER_ELIMINATED'; playerId: string }
  | { type: 'GAME_OVER'; winnerId: string }
  | { type: 'NEXT_WAVE_INFO'; mobType: string; element?: Element; count: number; hp: number }
  | { type: 'ERROR'; message: string };

export interface CombatAttack {
  towerX: number;
  towerY: number;
  targetX: number;
  targetY: number;
  damage: number;
  element: string;
  towerElement?: Element;
  mobElement?: Element;
  effectiveness?: 'strong' | 'weak' | 'neutral';
  splash: boolean;
}

export interface CombatKill {
  mobId: string;
  x: number;
  y: number;
  gold: number;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
  color?: PlayerColor;
}
