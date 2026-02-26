# Cosmic TD — Game Design

## Overview
Cosmic TD is a multiplayer tower defense game with element-based tower combos and PvP economy. Players defend their lane against waves of mobs while using a boss-fight system to acquire elements, build combo towers, and send PvP units to opponents. Last survivor wins.

## Core Systems

### 1. Base Towers
Two base tower types available from round 1, purchased with credits:

| Tower | Cost | Description | Upgrades |
|-------|------|-------------|----------|
| **Blaster** | 100cr | Rapid fire laser shots (high DPS) | T1→T2 (150cr) → T3 (250cr) |
| **Railgun** | 150cr | Slow, massive kinetic impact with splash | T1→T2 (200cr) → T3 (350cr) |

- **T3+ Element**: Apply ONE element to a T3 tower to create a T3+ tower. This is the max upgrade. The element grants bonus effects (burn, slow, stun, etc.) on attacks.
- **Sell**: Any tower can be sold at 70% of total invested credits.

### 2. Element Towers (Combo Towers)
Created by spending elements from your inventory:

- **Mono-element towers**: 1 element → tower with that element's properties
- **Combo towers**: 2 different elements → one of 21 unique combo towers from the tech tree
- **Upgrade ranks**:
  - Rank 1: 1 of each element used
  - Rank 2: 2 of each element used
  - **Rank 3 (Pure)**: 3 of ONE element (mono towers only). Maximum 1 pure tower active at a time. Selling a pure tower recovers the slot.
- **Sell**: 70% of total element value (converted to credits)

### 3. Element Acquisition — Boss System
Every 5 rounds (5, 10, 15, 20, 25, 30) is a **BOSS ROUND**:

1. Player **chooses** which element boss to fight
2. Boss spawns and follows the path
3. If the boss reaches the exit, it **loops back** to the start — player takes 5 HP damage per pass
4. Boss continues until killed — the element drop is **guaranteed**
5. Killing the boss grants **+1 of that element** in inventory

Elements are a currency/resource spent on:
- Building element towers
- Upgrading element towers
- Applying T3+ to base towers

### 4. Economy
- **Base income**: 50 credits/round
- **Kill rewards**: 2 credits per mob killed, 20 credits per boss killed
- **PvP income bonus**: Buying PvP units permanently increases your income/round

### 5. PvP System
Multiplayer simultaneous play. PvP interaction through the **PvP Shop**:

| Unit | Cost | Income Bonus | Stats |
|------|------|-------------|-------|
| Grunt | 50cr | +1/round | 1.5x HP, normal speed |
| Runner | 75cr | +1/round | 0.8x HP, 1.8x speed |
| Tank | 100cr | +2/round | 3x HP, 0.5x speed |

- Purchased units appear in the target opponent's next wave
- Buying units **permanently increases your income per round**
- Last survivor wins

### 6. Element Combo Tech Tree
21 unique combos from 7 elements (see `packages/shared/src/combos.ts`):

**Elements**: Solar ☀️, Cryo 🧊, Asteroid 🪨, Void 🕳️, Photon ⚡, Bio 🧬, Nebula 🌀

Each combo has a unique effect:
- **Plasma** (Solar+Cryo): DoT + slow
- **Meteor** (Solar+Asteroid): Burning impact zones
- **Eclipse** (Solar+Void): Drain speed, gain damage
- **Supernova** (Solar+Photon): AoE burst every 5th attack
- **Radiation** (Solar+Bio): Reduce mob max HP
- **Corona** (Solar+Nebula): Passive damage aura
- **Comet** (Cryo+Asteroid): Shatter splash damage
- **Absolute Zero** (Cryo+Void): Chance to fully freeze
- **Prism** (Cryo+Photon): Split into multiple beams
- **Cryogenics** (Cryo+Bio): Stacking slow → freeze
- **Frost Cloud** (Cryo+Nebula): Death frost zones
- **Black Hole** (Asteroid+Void): Gravity pull + slow
- **Crystal** (Asteroid+Photon): Ramping damage
- **Fossil** (Asteroid+Bio): Death traps
- **Dust Storm** (Asteroid+Nebula): AoE slow
- **Antimatter** (Void+Photon): % max HP damage
- **Parasite** (Void+Bio): Chain damage
- **Dark Matter** (Void+Nebula): Ignores armor
- **Bioluminescence** (Photon+Bio): Heal towers
- **Aurora** (Photon+Nebula): Always hits weakness
- **Spore Cloud** (Bio+Nebula): Stacking DoT

### 7. Game Flow
```
Round 1: Prep → Combat
Round 2: Prep → Combat
Round 3: Prep → Combat
Round 4: Prep → Combat
Round 5: Boss Select → Boss Fight → Prep → Combat
Round 6-9: Prep → Combat
Round 10: Boss Select → Boss Fight → Prep → Combat
... (continues to round 30)
```

### 8. Removed Mechanics
- ❌ TFT-style shop with random tower rolls
- ❌ Tower fusion (3 of same → upgrade)
- ❌ Augment/perk system
- ❌ Mining Probe tower
- ❌ Warp Gate tower
- ❌ Interest on gold
- ❌ Win/loss streaks

### 9. Architecture
- **Client**: Phaser 3 (TypeScript)
- **Server**: Node.js WebSocket server
- **Shared**: Common types, constants, tower/element definitions
- **Multiplayer**: Real-time WebSocket, simultaneous play, up to 4 players
