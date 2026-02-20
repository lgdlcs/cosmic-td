// ── Core Enums ──────────────────────────────────────────

export type Element = 'fire' | 'water' | 'earth' | 'wind' | 'light' | 'dark';
export const ELEMENTS: Element[] = ['fire', 'water', 'earth', 'wind', 'light', 'dark'];

export type TowerTier = 1 | 2 | 3;

export type PlayerColor = 'blue' | 'red' | 'green' | 'orange';
export const PLAYER_COLORS: PlayerColor[] = ['blue', 'red', 'green', 'orange'];

export type GamePhase = 'lobby' | 'shopping' | 'combat' | 'gameOver';

// ── Grid ────────────────────────────────────────────────

export interface GridPos {
  row: number; // 0-7
  col: number; // 0-7
}

// ── Tower ───────────────────────────────────────────────

export interface TowerDef {
  id: string;
  name: string;
  elements: Element[];
  tier: TowerTier;
  cost: number;
  damage: number;
  attackSpeed: number; // attacks per second
  range: number;       // grid cells
  special?: string;
  splashRadius?: number; // for AoE towers
}

export interface TowerInstance {
  instanceId: string;
  defId: string;
  position: GridPos;
  appliedElements: Element[];  // 0, 1, or 2 elements applied to this tower
}

// ── Mob ─────────────────────────────────────────────────

export type MobType = 'grunt' | 'runner' | 'tank' | 'swarm' | 'flying' | 'boss';

export interface MobDef {
  id: string;
  type: MobType;
  baseHp: number;
  speed: number;   // cells per second
  damage: number;  // HP lost on leak
}

export interface MobEffect {
  type: 'slow' | 'poison' | 'burn' | 'freeze';
  remaining: number; // ms
  value: number;     // slow %, dps, etc.
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
}

// ── Hex ─────────────────────────────────────────────────

export type HexId =
  | 'haste'
  | 'fog'
  | 'reinforcements'
  | 'siege_golem'
  | 'corruption'
  | 'mirage'
  | 'earthquake'
  | 'void_rift'
  | 'leech';

export interface HexDef {
  id: HexId;
  name: string;
  description: string;
  cost: number;
  tier: 1 | 2 | 3;
}

export interface HexCast {
  hexId: HexId;
  fromPlayerId: string;
  toPlayerId: string;
}

// ── Player ──────────────────────────────────────────────

export interface PlayerState {
  id: string;
  name: string;
  color: PlayerColor;
  hp: number;
  gold: number;
  level: number;
  xp: number;
  xpToNext: number;
  towers: TowerInstance[];
  elementPoints: Record<Element, number>;  // 0-3 points per element
  pendingElementPoint: boolean;            // true if player must choose an element this round
  shop: (string | null)[];                // 5 shop slots, defIds or null
  synergies: Record<Element, number>;     // kept for compatibility, calculated from elementPoints
  streak: number;
  alive: boolean;
  incomingHex: HexCast | null;
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
  mobs: Record<string, MobInstance[]>; // playerId → mobs
  winner: string | null;
}

// ── Network Messages ────────────────────────────────────

// Client → Server
export type ClientMsg =
  | { type: 'JOIN_LOBBY'; name: string; roomCode?: string }
  | { type: 'READY' }
  | { type: 'BUY_AND_PLACE'; shopIndex: number; position: GridPos }
  | { type: 'SELL_TOWER'; instanceId: string }
  | { type: 'CHOOSE_ELEMENT'; element: Element }
  | { type: 'UPGRADE_TOWER'; instanceId: string; element: Element }
  | { type: 'REROLL' }
  | { type: 'CAST_HEX'; hexId: HexId; targetPlayerId: string }
  | { type: 'DEV_START_COMBAT' };

// Server → Client
export type ServerMsg =
  | { type: 'YOUR_ID'; id: string }
  | { type: 'LOBBY_UPDATE'; players: LobbyPlayer[]; roomCode: string }
  | { type: 'GAME_START'; state: GameState; mapDef: GameMap }
  | { type: 'PHASE_CHANGE'; phase: GamePhase; round: number; timer: number }
  | { type: 'STATE_UPDATE'; state: GameState }
  | { type: 'SHOP_UPDATE'; shop: (string | null)[]; gold: number }
  | { type: 'MOB_SYNC'; mobs: Record<string, MobInstance[]> }
  | { type: 'TOWER_ATTACK'; playerId: string; towerId: string; targetId: string; damage: number }
  | { type: 'COMBAT_EVENTS'; playerId: string; attacks: CombatAttack[]; kills: string[]; leaks: string[] }
  | { type: 'MOB_KILLED'; playerId: string; mobId: string; goldReward: number }
  | { type: 'MOB_LEAKED'; playerId: string; mobId: string; damage: number; sentTo: string }
  | { type: 'HEX_INCOMING'; hex: HexCast }
  | { type: 'HEX_ACTIVATED'; hex: HexCast }
  | { type: 'PLAYER_ELIMINATED'; playerId: string }
  | { type: 'GAME_OVER'; winnerId: string }
  | { type: 'ERROR'; message: string };

export interface CombatAttack {
  towerX: number;
  towerY: number;
  targetX: number;
  targetY: number;
  damage: number;
  element: string;
  splash: boolean;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
}
