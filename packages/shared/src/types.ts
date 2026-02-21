// ── Core Enums ──────────────────────────────────────────

export type TowerType = 'arrow' | 'cannon' | 'income' | 'pvp';
export const TOWER_TYPES: TowerType[] = ['arrow', 'cannon', 'income', 'pvp'];

export type TowerTier = 1 | 2 | 3;

export type PlayerColor = 'blue' | 'red' | 'green' | 'orange';
export const PLAYER_COLORS: PlayerColor[] = ['blue', 'red', 'green', 'orange'];

export type GamePhase = 'lobby' | 'shopping' | 'augmentPick' | 'combat' | 'gameOver';

// ── Grid ────────────────────────────────────────────────

export interface GridPos {
  row: number;
  col: number;
}

// ── Tower ───────────────────────────────────────────────

export interface TowerDef {
  id: string;
  name: string;
  towerType: TowerType;
  cost: number;
  damage: number;
  attackSpeed: number; // attacks per second
  range: number;       // grid cells
  description: string;
  splashRadius?: number;
  incomePerRound?: number;
  mobPower?: number;
}

export interface TowerInstance {
  instanceId: string;
  defId: string;        // tower def id (arrow, cannon, income, pvp)
  position: GridPos;
  stars: number;        // 0 = base, 1 = ★ (fused from 3)
}

// ── Mob ─────────────────────────────────────────────────

export type MobType = 'grunt' | 'runner' | 'tank' | 'swarm' | 'flying' | 'boss';

export interface MobDef {
  id: string;
  type: MobType;
  baseHp: number;
  speed: number;
  damage: number;
}

export interface MobEffect {
  type: 'slow' | 'poison' | 'burn' | 'freeze';
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
}

// ── Player ──────────────────────────────────────────────

export interface PlayerState {
  id: string;
  name: string;
  color: PlayerColor;
  hp: number;
  gold: number;
  towers: TowerInstance[];
  shop: (string | null)[];    // 5 shop slots, tower defIds or null
  augments: string[];         // picked augment IDs
  streak: number;
  alive: boolean;
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
  /** Augment choices per player during AUGMENT_PICK phase */
  augmentChoices?: Record<string, string[]>; // playerId → augment IDs
}

// ── Game Config (lobby settings) ────────────────────────

export interface GameConfig {
  startingGold: number;
  startingHp: number;
}

// ── Network Messages ────────────────────────────────────

// Client → Server
export type ClientMsg =
  | { type: 'JOIN_LOBBY'; name: string; roomCode?: string }
  | { type: 'SET_CONFIG'; config: Partial<GameConfig> }
  | { type: 'READY' }
  | { type: 'BUY_AND_PLACE'; shopIndex: number; position: GridPos }
  | { type: 'SELL_TOWER'; instanceId: string }
  | { type: 'REROLL' }
  | { type: 'PICK_AUGMENT'; augmentId: string }
  | { type: 'DEV_START_COMBAT' }
  | { type: 'SET_SPEED'; speed: number };

// Server → Client
export type ServerMsg =
  | { type: 'YOUR_ID'; id: string }
  | { type: 'LOBBY_UPDATE'; players: LobbyPlayer[]; roomCode: string; config: GameConfig; isHost: boolean }
  | { type: 'GAME_START'; state: GameState; mapDef: GameMap }
  | { type: 'PHASE_CHANGE'; phase: GamePhase; round: number; timer: number }
  | { type: 'SPEED_CHANGE'; speed: number }
  | { type: 'STATE_UPDATE'; state: GameState }
  | { type: 'SHOP_UPDATE'; shop: (string | null)[]; gold: number }
  | { type: 'MOB_SYNC'; mobs: Record<string, MobInstance[]> }
  | { type: 'TOWER_ATTACK'; playerId: string; towerId: string; targetId: string; damage: number }
  | { type: 'COMBAT_EVENTS'; playerId: string; attacks: CombatAttack[]; kills: CombatKill[]; leaks: string[] }
  | { type: 'MOB_KILLED'; playerId: string; mobId: string; goldReward: number }
  | { type: 'MOB_LEAKED'; playerId: string; mobId: string; damage: number; sentTo: string }
  | { type: 'AUGMENT_CHOICES'; choices: { id: string; name: string; description: string; icon: string; tier: number }[] }
  | { type: 'AUGMENT_PICKED'; playerId: string; augmentId: string }
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
}
