# Element Chess TD — Technical Design Document

---

## 1. Architecture Overview

```
┌─────────────┐     WebSocket      ┌─────────────────┐
│   Browser    │◄──────────────────►│   Game Server    │
│  (Phaser 3)  │                    │   (Node.js)      │
│              │   JSON messages    │                  │
│  - Rendering │◄──────────────────►│  - Game state    │
│  - Input     │                    │  - Turn logic    │
│  - UI        │                    │  - Mob AI        │
│  - Animations│                    │  - Economy       │
│              │                    │  - Shared pool   │
└─────────────┘                    └─────────────────┘
```

### Principle: Server-Authoritative

The server owns **all game state**. Clients are renderers + input devices.
- Client sends: `PLACE_TOWER`, `BUY_TOWER`, `REROLL`, `LEVEL_UP`, `CAST_HEX`, `SELL_TOWER`
- Server validates, updates state, broadcasts to all clients
- No cheating possible — client never computes damage, gold, or HP

---

## 2. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Game engine** | Phaser 3 | Mature 2D engine, great for tile-based games, huge community |
| **Language** | TypeScript | Shared types between client & server |
| **Server** | Node.js + ws | Lightweight WebSocket server, same language as client |
| **Bundler** | Vite | Fast dev server, HMR, TS out of the box |
| **Monorepo** | npm workspaces | Shared types package between client/server |
| **Deploy** | LAN / Fly.io | LAN for the event, Fly.io if online needed |

---

## 3. Project Structure

```
element-chess-td/
├── docs/
│   ├── GAME_DESIGN.md
│   └── TECHNICAL.md
├── packages/
│   ├── shared/                 # Shared types & constants
│   │   ├── src/
│   │   │   ├── types.ts        # All game types
│   │   │   ├── constants.ts    # Balance numbers, element data
│   │   │   ├── elements.ts     # Element definitions, combos
│   │   │   └── maps.ts         # Map layouts (paths)
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── server/                 # Game server
│   │   ├── src/
│   │   │   ├── index.ts        # Entry, WebSocket setup
│   │   │   ├── lobby.ts        # Room creation, join, ready
│   │   │   ├── game.ts         # Main game loop orchestrator
│   │   │   ├── state.ts        # GameState management
│   │   │   ├── economy.ts      # Gold, XP, income, interest
│   │   │   ├── shop.ts         # Tower pool, reroll, odds
│   │   │   ├── combat.ts       # Mob spawning, tower targeting, damage
│   │   │   ├── hex.ts          # Hex system logic
│   │   │   ├── sync.ts         # State diffing & broadcast
│   │   │   └── utils.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── client/                 # Phaser 3 game client
│       ├── src/
│       │   ├── main.ts         # Phaser config, boot
│       │   ├── scenes/
│       │   │   ├── LobbyScene.ts
│       │   │   ├── GameScene.ts    # Main gameplay
│       │   │   └── GameOverScene.ts
│       │   ├── ui/
│       │   │   ├── ShopBar.ts      # Tower shop UI
│       │   │   ├── HexPanel.ts     # Hex casting panel
│       │   │   ├── SynergyBar.ts   # Active synergies display
│       │   │   ├── OpponentPanel.ts # Other players HP/status
│       │   │   └── TopBar.ts       # Round, HP, gold, timer
│       │   ├── objects/
│       │   │   ├── Tower.ts        # Tower game object
│       │   │   ├── Mob.ts          # Mob game object
│       │   │   ├── Projectile.ts   # Bullet/spell visuals
│       │   │   └── Grid.ts         # 8x8 grid rendering
│       │   ├── network/
│       │   │   └── socket.ts       # WebSocket client wrapper
│       │   └── assets/             # Sprites, sounds
│       ├── index.html
│       ├── package.json
│       └── tsconfig.json
├── package.json                # Workspace root
└── README.md
```

---

## 4. Shared Types (packages/shared)

```typescript
// === Core Enums ===

type Element = 'fire' | 'water' | 'earth' | 'wind' | 'light' | 'dark';
type TowerTier = 1 | 2 | 3;
type StarLevel = 0 | 1 | 2;  // 0=base, 1=★, 2=★★

// === Tower ===

interface TowerDef {
  id: string;                    // e.g. "fire_t1", "steam_t2"
  name: string;
  elements: Element[];           // 1 elem = T1, 2 = T2, 3 = T3
  tier: TowerTier;
  cost: number;
  damage: number;
  attackSpeed: number;           // attacks per second
  range: number;                 // in grid cells
  special?: string;              // ability description
}

interface TowerInstance {
  instanceId: string;            // unique per placed tower
  defId: string;                 // ref to TowerDef
  position: GridPos;
  starLevel: StarLevel;
  element: Element | null;       // null if Corrupted (hex)
}

// === Mob ===

interface MobDef {
  type: 'grunt' | 'runner' | 'tank' | 'swarm' | 'flying' | 'boss';
  baseHp: number;
  speed: number;                 // cells per second
  damage: number;                // HP lost on leak
}

interface MobInstance {
  instanceId: string;
  defId: string;
  hp: number;
  maxHp: number;
  position: { x: number; y: number };  // float, lerped along path
  pathIndex: number;             // current path waypoint
  effects: MobEffect[];         // slow, poison, etc.
  visible: boolean;              // false during Mirage hex
}

interface MobEffect {
  type: 'slow' | 'poison' | 'burn' | 'freeze' | 'confuse';
  duration: number;              // ms remaining
  value: number;                 // slow %, dps, etc.
  source: string;                // tower instanceId
}

// === Player State ===

interface PlayerState {
  id: string;
  name: string;
  color: 'blue' | 'red' | 'green' | 'orange';
  hp: number;
  gold: number;
  level: number;
  xp: number;
  xpToNext: number;
  towers: TowerInstance[];       // placed towers
  bench: TowerDef[];             // bought but not placed (max 8)
  shop: (TowerDef | null)[];     // 5 shop slots
  synergies: Map<Element, number>;
  streak: number;
  alive: boolean;
  incomingHex: Hex | null;       // hex targeting this player
}

// === Game State ===

interface GameState {
  phase: 'lobby' | 'shopping' | 'combat' | 'gameOver';
  round: number;
  timer: number;                 // seconds remaining in phase
  players: PlayerState[];
  map: GameMap;
  mobs: Map<string, MobInstance[]>;  // per player
  pool: Map<string, number>;         // shared tower pool (defId → remaining count)
  winner: string | null;
}

// === Map ===

interface GridPos {
  row: number;  // 0-7
  col: number;  // 0-7
}

interface GameMap {
  id: string;
  name: string;
  path: GridPos[];               // ordered waypoints
  entry: GridPos;
  exit: GridPos;
}

// === Hex ===

type HexId = 'haste' | 'fog' | 'reinforcements' | 'siege_golem' | 'corruption' | 'mirage' | 'earthquake' | 'void_rift' | 'leech';

interface Hex {
  id: HexId;
  cost: number;
  tier: 1 | 2 | 3;
  name: string;
  description: string;
}

// === Network Messages ===

// Client → Server
type ClientMsg =
  | { type: 'JOIN_LOBBY'; name: string; roomCode?: string }
  | { type: 'READY' }
  | { type: 'BUY_TOWER'; shopIndex: number }
  | { type: 'SELL_TOWER'; instanceId: string }
  | { type: 'PLACE_TOWER'; defId: string; position: GridPos }
  | { type: 'MOVE_TOWER'; instanceId: string; position: GridPos }
  | { type: 'REROLL' }
  | { type: 'LEVEL_UP' }
  | { type: 'CAST_HEX'; hexId: HexId; targetPlayerId: string };

// Server → Client
type ServerMsg =
  | { type: 'LOBBY_UPDATE'; players: { id: string; name: string; ready: boolean }[]; roomCode: string }
  | { type: 'GAME_START'; state: GameState }
  | { type: 'PHASE_CHANGE'; phase: GameState['phase']; timer: number }
  | { type: 'STATE_UPDATE'; state: GameState }        // full state (client filters to own view)
  | { type: 'PLAYER_UPDATE'; player: PlayerState }     // partial, just your state
  | { type: 'MOB_SPAWN'; playerId: string; mobs: MobInstance[] }
  | { type: 'MOB_UPDATE'; playerId: string; mobs: MobInstance[] }  // position/hp tick
  | { type: 'MOB_KILLED'; playerId: string; mobId: string }
  | { type: 'MOB_LEAKED'; playerId: string; mobId: string; damage: number }
  | { type: 'TOWER_ATTACK'; towerId: string; targetId: string }   // for animations
  | { type: 'HEX_INCOMING'; hex: Hex; fromPlayer: string }
  | { type: 'HEX_ACTIVATED'; hex: Hex }
  | { type: 'PLAYER_ELIMINATED'; playerId: string }
  | { type: 'GAME_OVER'; winner: string }
  | { type: 'ERROR'; message: string };
```

---

## 5. Server Game Loop

```
Server tick rate: 20 ticks/second (50ms)

LOBBY:
  → Wait for 2-4 players to join + ready up
  → Select random map
  → Initialize shared pool
  → Broadcast GAME_START

For each round (1-30):

  SHOPPING PHASE (20 seconds):
    → Generate shop for each player (based on level + pool)
    → Accept client commands (buy, place, reroll, level up, hex)
    → Validate all actions server-side
    → Broadcast state updates
    → Timer countdown

  COMBAT PHASE (variable, until all mobs dead or leaked):
    → Spawn mobs based on round number + hex modifications
    → Every tick (50ms):
      ├─ Move mobs along path (speed × dt)
      ├─ Tower targeting (closest mob in range)
      ├─ Damage calculation (with element bonuses, synergies)
      ├─ Apply effects (slow, burn, poison)
      ├─ Check mob death → gold reward
      ├─ Check mob leak → HP damage + send to opponent
      └─ Broadcast MOB_UPDATE (batched, every 3 ticks = 150ms)
    → Phase ends when all mobs resolved

  REWARDS:
    → Calculate income (base + interest + clean + streak)
    → Grant passive XP (+2)
    → Check eliminations
    → If 1 player left → GAME_OVER

GAME_OVER:
  → Broadcast winner
  → Return to lobby
```

---

## 6. Network Protocol

### Visibility Rules (Anti-cheat)

Each player receives:
- **Full:** Own PlayerState (towers, gold, shop, bench, synergies)
- **Limited:** Opponents (HP, level, tower count, element distribution — NOT exact positions or gold)
- **Full:** Mob positions for all players (needed to render opponent grids)
- **Event-based:** Tower attacks, hex casts (for animations)

### State Sync Strategy

- **Shopping phase:** Event-driven only (buy/sell/place triggers targeted updates)
- **Combat phase:** Batched mob updates every 150ms (positions + HP)
- **Full state sync:** On phase change only (keeps bandwidth low)
- **Bandwidth estimate:** ~2-5 KB/s per client during combat

### Reconnection

- Server keeps state for 60s after disconnect
- Client reconnects → full state sync
- If timeout → player plays on autopilot (no actions, towers still shoot)

---

## 7. Combat System Details

### Tower Targeting Priority
1. Closest mob to exit (most dangerous)
2. If tie → lowest HP (secure the kill)
3. Special: AoE towers target cluster center

### Damage Formula
```
finalDamage = baseDamage
  × (1 + synergyBonus)        // e.g. +0.2 for 3-piece
  × (1 + starBonus)           // ★ = +0.5, ★★ = +1.0
  × elementMultiplier          // 1.0 default, could add weakness system later
```

### Mob Path Movement
```
Each tick:
  effectiveSpeed = baseSpeed × (1 - totalSlow)   // slow caps at 80%
  distance = effectiveSpeed × (tickMs / 1000)
  advance mob along path by distance
  if mob reaches exit → leak event
```

---

## 8. Client Rendering (Phaser 3)

### Layers (bottom to top)
1. **Background** — grid tiles, player color tint
2. **Path** — highlighted path tiles
3. **Towers** — placed tower sprites
4. **Mobs** — mob sprites walking the path
5. **Projectiles** — bullets, spells, effects
6. **UI Overlay** — shop, hex panel, synergy bar, top bar

### Grid Rendering
- Each cell = 64×64 pixels
- Grid = 512×512 pixels
- Total canvas ~800×700 (grid + UI margins)
- Opponent grids rendered small (128×128) in side panel

### Sprites (MVP)
- **Towers:** Colored geometric shapes per element (circle=fire, diamond=water, square=earth, triangle=wind, star=light, hexagon=dark)
- **Mobs:** Simple colored circles with HP bar
- **Path:** Slightly lighter tiles with directional arrows
- **Projectiles:** Small colored dots/lines

### Animations
- Tower attack: brief flash + projectile travel
- Mob death: fade out + small particle burst
- Hex incoming: icon floats above grid with warning color
- Phase transition: screen-wide text ("COMBAT!" / "SHOP PHASE")

---

## 9. Development Plan

### Week 1: Solo Core Loop

**Day 1-2: Foundation**
- [ ] Monorepo setup (npm workspaces, Vite, TypeScript)
- [ ] Phaser 3 boot + grid rendering
- [ ] Shared types + constants
- [ ] Basic tile map with path visualization

**Day 3-4: Economy + Shop**
- [ ] Shop UI (5 slots + reroll + level up)
- [ ] Tower pool system
- [ ] Buy/sell/place tower flow
- [ ] Gold + XP state management
- [ ] Phase timer (shopping countdown)

**Day 5-6: Combat**
- [ ] Mob spawning on path
- [ ] Mob movement along waypoints
- [ ] Tower targeting + shooting
- [ ] Damage calculation + mob death
- [ ] Leak detection + HP damage
- [ ] Round progression (wave scaling)

**Day 7: Polish Solo**
- [ ] Fusion system (3→★)
- [ ] Elemental synergies (bonuses)
- [ ] Income calculation (interest, clean, streak)
- [ ] All 6 T1 towers with distinct stats
- [ ] Basic sound effects

### Week 2: Multiplayer + Hexes

**Day 8-9: Server**
- [ ] WebSocket server setup
- [ ] Lobby system (room code, join, ready)
- [ ] Server-authoritative game state
- [ ] Client→Server action validation
- [ ] State broadcasting

**Day 10-11: Multi Integration**
- [ ] Client networking layer
- [ ] Opponent grid rendering (mini view)
- [ ] Leak → send to opponent logic
- [ ] HP tracking + elimination
- [ ] Shared pool sync

**Day 12-13: Hexes + T2 Towers**
- [ ] Hex UI panel (select hex, select target)
- [ ] 3 MVP hexes (Haste, Reinforcements, Siege Golem)
- [ ] 3-4 T2 tower implementations
- [ ] Hex incoming notification

**Day 14: Final Polish**
- [ ] Bug fixes + playtesting
- [ ] Balance tuning (mob HP, tower damage, gold amounts)
- [ ] Lobby code sharing (URL or display code)
- [ ] Deploy for LAN or Fly.io
- [ ] README with how to run

---

## 10. Running the Game

### Development
```bash
# Install dependencies
npm install

# Start dev server (client + server concurrent)
npm run dev
# → Client: http://localhost:5173
# → Server: ws://localhost:3001

# Type checking
npm run typecheck
```

### Production / LAN Event
```bash
npm run build
npm start
# → Serves client + WebSocket on port 3000
# → Share local IP: http://192.168.x.x:3000
```

---

## 11. Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Server-authoritative | Yes | No cheating, consistent state |
| Tick rate | 20/s | Smooth enough for TD, light on CPU |
| Mob sync frequency | ~7/s | Balance between smooth movement and bandwidth |
| Phaser 3 over canvas | Phaser | Sprite management, tweens, input handling built-in |
| Monorepo | npm workspaces | Share types, simple setup, no extra tooling |
| WebSocket over WebRTC | WebSocket | Simpler, server-authoritative anyway, reliable |
| Vite over Webpack | Vite | 10x faster dev builds, TS native |
