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
| Buy tower | 3–5 gold (depends on tier) |
| Reroll shop | 2 gold |
| Buy XP | 4 gold → 4 XP |
| Cast Hex | 3–20 gold (see §8) |

### Starting Conditions
- **Gold:** 10
- **HP:** 100
- **Level:** 1
- **Shop slots:** 5

---

## 4. Level & XP System

| Level | XP Required | Shop Odds (T1/T2/T3) |
|---|---|---|
| 1 | — | 100 / 0 / 0 |
| 2 | 4 XP | 80 / 20 / 0 |
| 3 | 8 XP | 60 / 35 / 5 |
| 4 | 12 XP | 40 / 45 / 15 |
| 5 | 16 XP | 25 / 40 / 35 |
| 6 | 24 XP | 15 / 30 / 55 |

- 2 XP granted passively per round
- Additional XP purchasable (4 gold = 4 XP)
- Max level: 6

---

## 5. Elements & Towers

### 6 Base Elements (T1)

| Element | Color | Tower Type | Attack Style |
|---|---|---|---|
| 🔥 Fire | Red/Orange | Flame Spitter | AoE splash damage |
| 💧 Water | Blue | Frost Fountain | Single target + slow |
| 🌍 Earth | Brown/Green | Stone Sentinel | High damage, slow attack |
| 💨 Wind | Cyan/White | Gale Archer | Fast attack, long range |
| ☀️ Light | Gold/Yellow | Radiance Beacon | Buff aura + reveal invis |
| 🌑 Dark | Purple | Shadow Caster | DoT poison, debuff mobs |

### T2 Towers — Dual Element Combinations (15 total)

| Combo | Name | Special |
|---|---|---|
| Fire + Water | **Steam Engine** | AoE slow zone + tick damage |
| Fire + Earth | **Magma Cannon** | Massive single-target, burning ground |
| Fire + Wind | **Inferno Tornado** | Moving AoE, sweeps the path |
| Fire + Light | **Solar Flare** | Burst damage, briefly blinds mobs (slow) |
| Fire + Dark | **Hellfire Pyre** | AoE + DoT stack |
| Water + Earth | **Mudslide Trap** | Creates slow zone on path |
| Water + Wind | **Tsunami Wave** | Periodic knockback wave |
| Water + Light | **Purify Spring** | Heals nearby towers + reveals |
| Water + Dark | **Venom Tide** | Stacking poison, spreads on kill |
| Earth + Wind | **Sandstorm Pillar** | Reduces mob accuracy (miss chance) |
| Earth + Light | **Crystal Guardian** | Shield aura, absorbs damage for adjacent towers |
| Earth + Dark | **Grave Monolith** | Killed mobs rise as blockers (briefly) |
| Wind + Light | **Lightning Spire** | Chain lightning, bounces between mobs |
| Wind + Dark | **Phantom Gust** | Chance to confuse mobs (reverse direction) |
| Light + Dark | **Eclipse Tower** | Alternates buff/debuff phases |

### T3 Towers — Triple Element (20 total)

Too many to detail — MVP ships with 5-6 T3 towers, expand later.

Example:
- **Fire + Water + Wind** = **Cyclone Furnace** — massive AoE, slow + burn + fast attack
- **Earth + Light + Dark** = **Lich King Obelisk** — summons undead blockers + buff/debuff aura

### Fusion System (3-star)

- 3 copies of the **same tower** → fused into **★ version**
- ★ = +50% stats, enhanced ability
- 3x ★ = ★★ (unlikely but devastating)

### Elemental Synergies (board-wide)

| Count | Bonus |
|---|---|
| 2 same element | +10% attack speed for that element |
| 3 same element | +20% damage for that element |
| 4 same element | +30% damage + special proc (element-specific) |

Element-specific 4-piece procs:
- 🔥 Fire 4: Attacks have 20% chance to explode (double AoE)
- 💧 Water 4: Slow becomes freeze (1s stun) on proc
- 🌍 Earth 4: Towers gain +50% HP (can tank Siege Golems)
- 💨 Wind 4: Attacks have 15% chance for double strike
- ☀️ Light 4: All towers gain +1 range
- 🌑 Dark 4: Mobs take 3% max HP/s as shadow damage

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

## 9. Shared Pool

- All players draw from the **same tower pool**
- If Player 1 buys a Fire T1, there's one less in the pool
- Pool size per tower: T1 = 30 copies, T2 = 15 copies, T3 = 8 copies
- Selling a tower returns it to the pool
- Creates metagame: scout opponents, pivot elements if contested

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
