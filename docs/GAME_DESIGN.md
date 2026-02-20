# Element Chess TD — Game Design Document

> Auto-chess meets Element TD. Multiplayer tower defense with elemental synergies, shop/reroll mechanics, and Hex aggression.

---

## 1. Overview

- **Genre:** Multiplayer Tower Defense / Auto-Chess hybrid
- **Players:** 2–4
- **Platform:** Web browser (desktop)
- **Session length:** 15–25 minutes
- **Art style:** 2D top-down, Kingdom Rush-inspired, clean & readable

---

## 2. Core Loop

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   SHOP PHASE (20s)  →  BATTLE PHASE  →  REWARDS        │
│   ├─ Buy towers          Mobs spawn      ├─ Gold       │
│   ├─ Place/move          Auto-combat     ├─ Interest   │
│   ├─ Reroll shop         Towers shoot    ├─ Clean +3   │
│   ├─ Level up (XP)       Leak = damage   └─ Streak     │
│   └─ Cast Hexes                                        │
│                                                         │
│   ←──────────── REPEAT ──────────────────→              │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Economy

### Gold Sources
| Source | Amount | Condition |
|---|---|---|
| Base income | 5 gold/round | Always |
| Interest | +1 per 10 gold saved | Max +5 (at 50g) |
| Clean bonus | +3 gold | 0 mobs leaked |
| Win streak | +1/+2/+3 | 2/4/6+ consecutive cleans |

### Gold Sinks
| Action | Cost |
|---|---|
| Buy base tower | 3–5 gold (Archer/Cannon/Mage) |
| Buy element crystal | 4 gold |
| Reroll shop | 2 gold |
| Upgrade tower (T1) | 3 gold (apply first element) |
| Upgrade tower (T2) | 5 gold (apply second element) |
| Cast Hex | 3–20 gold (see §8) |

### Starting Conditions
- **Gold:** 50 (increased for testing)
- **HP:** 100
- **Element Points:** 0 in all elements
- **Shop slots:** 5

---

## 4. Element Point System

**How to gain Element Points:**
- **Each round (except round 1):** Choose +1 point for any element (free)
- **Element Crystals:** Buy from shop for 4 gold (+1 point for specific element)

**Element Point Progression:**
| Points | Unlock/Bonus |
|---|---|
| 0 | Element locked (cannot apply to towers) |
| 1 | **Unlocked** — can apply as T1 upgrade |
| 2 | **+15% damage** to all towers with this element + can apply as T2 upgrade |
| 3 | **+30% damage** to all towers with this element + enhanced effects |

**Element Point Cap:** 3 points maximum per element.

---

## 5. Base Towers & Element System

### 3 Base Tower Types (No Elements)

| Tower | Cost | Damage | Attack Speed | Range | Special |
|---|---|---|---|---|---|
| **Archer** | 3g | 6 | 1.5/s | 3 | Fast single-target attacks |
| **Cannon** | 4g | 12 | 0.6/s | 2 | Slow AoE splash (radius 1) |
| **Mage** | 5g | 8 | 1.0/s | 2.5 | Moderate damage, can apply effects |

### 6 Element Effects

| Element | Effect | Description |
|---|---|---|
| 🔥 **Fire** | Burn DoT | 3 damage/second for 3 seconds |
| 💧 **Water** | Slow | 25% movement speed reduction for 2 seconds |
| 🌍 **Earth** | Power | +40% damage bonus |
| 💨 **Wind** | Speed | +30% attack speed bonus |
| ☀️ **Light** | Reveal | +1 range + reveals invisible mobs |
| 🌑 **Dark** | Poison | 4 damage/second for 3 seconds (stacking) |

### Tower Upgrade System

**How it Works:**
1. Place a **base tower** (Archer/Cannon/Mage) on the grid
2. **Right-click** the tower to open upgrade menu (during shop phase)
3. **Choose an element** to apply (requires 1+ points in that element)
4. **Pay upgrade cost:** 3g for first element, 5g for second element
5. Tower gains element's effects + damage bonus from your element points

**Examples:**
- **Archer** + 🔥Fire (1 point) = **Fire Archer** (6 damage → 6 damage + burn effect)
- **Archer** + 🔥Fire (2 points) = **Fire Archer** (6 damage → 6.9 damage + burn effect)
- **Fire Archer** + 💧Water = **Steam Archer** (damage + burn + slow effects)

### Element Point Damage Scaling

Your element points provide **global bonuses** to all towers with those elements:

- **1 point:** Base element unlocked
- **2 points:** +15% damage to all towers with this element  
- **3 points:** +30% damage to all towers with this element

**Example:** If you have 3 Fire points, ALL your Fire towers get +30% damage.

### Dynamic Tower Names

Tower names change based on applied elements:
- **Base:** "Archer", "Cannon", "Mage"
- **Single Element:** "Fire Archer", "Water Cannon", "Earth Mage"
- **Dual Element:** "Fire-Water Archer", "Earth-Wind Cannon", etc.

---

## 6. Mobs / Waves

### Wave Scaling
- 30 rounds total
- Mobs scale in HP and speed every round
- Every 5th round = **Boss wave** (1-3 elite mobs, high HP, special ability)

### Mob Types
| Type | Behavior |
|---|---|
| **Grunt** | Normal, walks the path |
| **Runner** | Fast, low HP |
| **Tank** | Slow, very high HP |
| **Swarm** | Lots of small mobs |
| **Flying** | Ignores path, goes straight to exit (only hit by Wind/Light) |
| **Boss** | Unique per wave, special ability |

### Leak Damage
- Each mob that reaches the exit deals damage based on its remaining HP %
- Grunt = 1-3 damage, Tank = 5-8, Boss = 15-20

---

## 7. The Grid

### Dimensions
- **8×8 grid** per player
- Fixed path (serpentine pattern)
- All non-path cells = valid tower placement

### Map System
- 3-5 premade maps with different path layouts
- One map selected randomly at game start
- **Same map for all players**
- Player color tint on terrain (10-15% saturation):
  - Player 1: Blue
  - Player 2: Red
  - Player 3: Green
  - Player 4: Orange

### Reference Map Layout (Map 1 — Serpentine)
```
  1 2 3 4 5 6 7 8
A . . ▶ ▶ ▶ ▶ . .   ← Entry
B . . . . . ▼ . .
C . . . . . ▼ . .
D . . ◀ ◀ ◀ ◀ . .
E . . ▼ . . . . .
F . . ▼ . . . . .
G . . ▶ ▶ ▶ ▶ . .
H . . . . . ✕ . .   ← Exit

▶▼◀ = mob path
.   = tower placement
✕   = exit point
```

---

## 8. Hex System (Aggression)

### How It Works
- During shop phase, spend gold to cast a Hex on a chosen opponent
- Target **sees** the incoming Hex (icon + name) but cannot cancel it
- Hex activates during the next battle phase
- Max 1 Hex sent per round per player (no spam)

### Hex List

**Tier 1 — 3-5 gold:**

| Hex | Cost | Effect |
|---|---|---|
| **Haste** | 3g | Mobs gain +30% move speed this round |
| **Fog of War** | 4g | 3 random towers become invisible (hidden stats/range) for 5s |
| **Reinforcements** | 5g | +5 bonus mobs added to the wave |

**Tier 2 — 8-10 gold:**

| Hex | Cost | Effect |
|---|---|---|
| **Siege Golem** | 8g | 1 tanky mob that stops to attack the first tower it passes |
| **Corruption** | 9g | 1 random tower loses its element for this round (breaks synergy) |
| **Mirage** | 10g | Mobs become invisible for 3s mid-path (only Light towers can see them) |

**Tier 3 — 15-20 gold:**

| Hex | Cost | Effect |
|---|---|---|
| **Earthquake** | 15g | All towers disabled for 2s at wave start |
| **Void Rift** | 18g | Second entry point opens for this round |
| **Leech** | 20g | Mobs leaked by target heal YOU for 5 HP each |

### MVP Hexes (ship first)
Haste, Reinforcements, Siege Golem — the rest are stretch goals.

---

## 9. Shop System

**Shop Contents (5 slots):**
- **Base Towers:** Archer (3g), Cannon (4g), Mage (5g)
- **Element Crystals:** 4g each, +1 point for specific element (20% chance per slot)

**No Shared Pool:** Base towers are unlimited — no competition for tower types.

**Competition is for Elements:** Players compete for element point accumulation and upgrade timing.

**Shop Strategy:**
- Early game: Buy base towers, get map presence
- Mid game: Buy crystals to boost key elements, upgrade existing towers  
- Late game: Focus on T2 upgrades (dual-element towers) for maximum power

---

## 10. Win Condition

- **Last player standing wins**
- Start at 100 HP
- Leak mobs = lose HP
- 0 HP = eliminated (can spectate)
- If 2+ players survive all 30 rounds → highest HP wins

---

## 11. UI Layout

```
┌──────────────────────────────────────────────┐
│  [Round 12]   [HP: 78]   [Gold: 23]   [⏱15s]│  ← Top bar
├──────────────┬───────────────────────────────┤
│              │                               │
│  OPPONENTS   │      YOUR 8×8 GRID            │
│  ┌────────┐  │                               │
│  │ P2: 92 │  │      (main play area)         │
│  │ P3: 65 │  │                               │
│  │ P4: 44 │  │                               │
│  └────────┘  │                               │
│              │                               │
│  HEX PANEL  │                               │
│  [Cast Hex] │                               │
│              │                               │
├──────────────┴───────────────────────────────┤
│  SHOP: [🔥T1] [💧T1] [💨T2] [☀️T1] [🌑T1]   │  ← Shop bar
│  [🔄 Reroll 2g]  [⬆️ Level Up 4g]  [Lv.3]   │
├──────────────────────────────────────────────┤
│  SYNERGIES: 🔥×2 (+10% AS) | 💧×1           │  ← Synergy bar
└──────────────────────────────────────────────┘
```

---

## 12. MVP Scope (2 weeks)

### Week 1 — Core
- [ ] Grid rendering + tower placement
- [ ] Shop system (buy, reroll, sell)
- [ ] Mob spawning + pathfinding on fixed path
- [ ] Tower shooting (basic targeting + damage)
- [ ] Gold economy (income, interest, clean bonus)
- [ ] Level/XP system affecting shop odds
- [ ] T1 towers (6 elements, basic stats)
- [ ] Fusion (3 copies → ★)

### Week 2 — Multi + Polish
- [ ] WebSocket multiplayer (lobby + game sync)
- [ ] Leak system (mobs → opponent)
- [ ] HP tracking + elimination
- [ ] Hex system (Haste, Reinforcements, Siege Golem)
- [ ] 3-4 T2 towers
- [ ] Elemental synergy bonuses
- [ ] Basic UI (shop bar, opponent panel, synergy display)
- [ ] Sound effects (minimal)

### Post-MVP (stretch)
- [ ] All 15 T2 towers
- [ ] T3 towers
- [ ] All 9 Hexes
- [ ] Multiple maps
- [ ] Player color tints
- [ ] Spectator mode
- [ ] Mobile responsive
