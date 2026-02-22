# 🚀 Cosmic TD

Auto-Chess × Tower Defense — In Space. Multiplayer browser game.

Build towers, pick elements, unlock combos, and crush your opponents.

## Quick Start

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: ws://localhost:3001

## LAN / Mobile Play

```bash
npm run dev
# Open http://<your-local-ip>:5173 on any device on the same Wi-Fi
```

## How to Play

### Towers
| Tower | Role | Description |
|-------|------|-------------|
| 🔫 **Blaster** | DPS | Rapid fire laser shots |
| 💥 **Railgun** | Burst | Slow, massive kinetic impact + splash |
| ⛏️ **Mining Probe** | Economy | Generates +2 credits per round |
| 🌀 **Warp Gate** | PvP | Warps alien mobs to opponent |

### Upgrade System
- **T1 → T2**: Click a tower + 2 same-type copies in shop → T2 (2x stats)
- **T2 → T3**: 2 T2 of same type on field → fuse into T3 (3x stats)
- Upgradeable towers glow green

### Elements (picked every 3 rounds)
| Element | Strong vs | Weak vs |
|---------|-----------|---------|
| ☀️ Solar | Bio | Cryo |
| 🧊 Cryo | Solar | Bio |
| 🪨 Asteroid | Photon | Void |
| 🕳️ Void | Cryo | Photon |
| ⚡ Photon | Void | Asteroid |
| 🧬 Bio | Cryo | Solar |
| 🌀 Nebula | Asteroid | Bio |

Elements evolve your Blasters and Railguns with unique effects (burn, freeze, stun, poison, chain damage...).

### 21 Element Combos
Pick 2 different elements to unlock a combo:

| Combo | Elements | Effect |
|-------|----------|--------|
| ♨️ Plasma | Solar + Cryo | DoT + slow |
| 🌋 Meteor | Solar + Asteroid | Burning impact zones |
| 🌑 Eclipse | Solar + Void | Speed drain → damage |
| 💥 Supernova | Solar + Photon | AoE burst every 5th hit |
| ☢️ Radiation | Solar + Bio | Reduce mob max HP |
| 👑 Corona | Solar + Nebula | Passive damage aura |
| ☄️ Comet | Cryo + Asteroid | Shatter AoE on impact |
| 🥶 Absolute Zero | Cryo + Void | Chance to freeze 1s |
| 🔮 Prism | Cryo + Photon | Split into 3 beams |
| 🧪 Cryogenics | Cryo + Bio | Slow stacks → freeze |
| 🌨️ Frost Cloud | Cryo + Nebula | Frost zones on kill |
| ⬛ Black Hole | Asteroid + Void | Pull mobs toward tower |
| 💎 Crystal | Asteroid + Photon | Ramping damage on same target |
| 🦴 Fossil | Asteroid + Bio | Death traps |
| 🌪️ Dust Storm | Asteroid + Nebula | AoE slow |
| ⚛️ Antimatter | Void + Photon | % max HP bonus damage |
| 🦠 Parasite | Void + Bio | Damage spreads between mobs |
| 🌌 Dark Matter | Void + Nebula | Ignores armor |
| ✨ Bioluminescence | Photon + Bio | Heals tower cooldowns |
| 🌈 Aurora | Photon + Nebula | Always hits element weakness |
| 🍄 Spore Cloud | Bio + Nebula | Increasing DoT spread |

### Game Flow
1. **Shop Phase** — Buy & place towers, reroll shop
2. **Every 3 rounds** — Pick an element or passive augment
3. **Combat Phase** — Mobs spawn, towers auto-attack
4. **Leaked mobs** → damage to your HP, sent to opponent in multiplayer
5. Last player standing wins!

### Controls
- **Click shop slot** → select tower → **click grid** to place
- **Click placed tower** → upgrade (if available) or sell
- **Tab** autocomplete in lobby
- **↑/↓** command history

## Stack

- **Client:** Phaser 3 + TypeScript + Vite
- **Server:** Node.js + WebSocket (server-authoritative)
- **Shared:** TypeScript types, constants & game logic
- **Monorepo:** npm workspaces

## Features

- 🎮 Multiplayer (2-4 players via WebSocket)
- 🌌 Space theme with animated starfield
- 🔊 Procedural sound effects (Web Audio API)
- 📱 Mobile & LAN play support
- ⭐ Tower upgrade system (T1 → T2 → T3)
- 🧬 7 elements + 21 dual-element combos
- 🛒 Shop with reroll + augment picks
- 👁️ Opponent mini-view
- 📋 Room code copy + URL sharing

## License

MIT
