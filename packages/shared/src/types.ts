import type { Element } from './elements.js';

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
  stars: TowerTier;     // 1 = base, 2 = ★★ (upgraded), 3 = ★★★
  element?: Element;    // assigned when player picks an element augment
  combo?: string;       // active combo ID applied to this tower
  canUpgrade?: boolean; // server-computed: can this tower be upgraded?
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
  element?: Element;    // assigned from round 3+
  armor?: number;       // base 0, can be reduced by dark cannon
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
  elements: Element[];        // collected element augments (ordered)
  activeCombo?: string;       // active combo ID (e.g., 'PLASMA')
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
  | { type: 'UPGRADE_TOWER'; towerId: string }
  | { type: 'DEV_START_COMBAT' }
  | { type: 'SET_SPEED'; speed: number }
  | { type: 'SET_COLOR'; color: PlayerColor } // Feature 3: Lobby color picker
  | { type: 'QUEUE_PVP_UNIT'; unitType: string; targetPlayerId: string } // Feature 4: PvP queue
  | { type: 'APPLY_ELEMENT'; towerId: string; element?: Element; comboId?: string };

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
  | { type: 'TOWER_UPGRADED'; playerId: string; towerId: string; newTier: TowerTier }
  | { type: 'COMBO_UNLOCKED'; playerId: string; comboId: string; comboName: string; comboColor: string }
  | { type: 'PLAYER_ELIMINATED'; playerId: string }
  | { type: 'GAME_OVER'; winnerId: string }
  | { type: 'ERROR'; message: string }
  | { type: 'NEXT_WAVE_INFO'; mobType: string; element?: Element; count: number; hp: number } // Feature 2: Next wave info
  | { type: 'PVP_QUEUE_UPDATE'; queue: PvPQueueEntry[] } // Feature 4: PvP queue update
  | { type: 'ELEMENT_APPLIED'; playerId: string; towerId: string; element?: Element; comboId?: string }
  | { type: 'FIRST_CLEAR'; playerId: string; bonus: number };

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
  color?: PlayerColor; // Feature 3: Lobby color picker
}

// ── PvP Queue (Feature 4) ───────────────────────────────

export interface PvPQueueEntry {
  unitType: string;
  targetPlayerId: string;
}

export interface PvPUnitDef {
  id: string;
  cost: number;
  hp_mult: number;
  speed_mult?: number;
}
