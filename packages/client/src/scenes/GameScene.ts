import Phaser from 'phaser';
import { socket } from '../network/socket';
import type {
  GameState,
  GameMap,
  ServerMsg,
  PlayerState,
  MobInstance,
  GridPos,
} from '@ect/shared';
import {
  GRID_SIZE,
  ELEMENT_COLORS,
  ELEMENT_SYMBOLS,
  TOWER_MAP,
  PLAYER_COLOR_HEX,
  isPathCell,
} from '@ect/shared';

const CELL = 64;
const GRID_X = 210;  // left offset for grid
const GRID_Y = 50;   // top offset for grid
const GRID_PX = CELL * GRID_SIZE; // 512

export class GameScene extends Phaser.Scene {
  private gameState!: GameState;
  private mapDef!: GameMap;
  private myId: string = '';

  // Layers
  private gridGfx!: Phaser.GameObjects.Graphics;
  private mobGfx!: Phaser.GameObjects.Graphics;
  private towerGfx!: Phaser.GameObjects.Graphics;
  private projectileGfx!: Phaser.GameObjects.Graphics;

  // UI
  private uiTopBar!: Phaser.GameObjects.Text;
  private uiPhase!: Phaser.GameObjects.Text;
  private uiShopSlots: Phaser.GameObjects.Text[] = [];
  private uiSynergy!: Phaser.GameObjects.Text;
  private uiBench!: Phaser.GameObjects.Text;
  private uiOpponents: Phaser.GameObjects.Text[] = [];
  private uiHexInfo!: Phaser.GameObjects.Text;

  // Timer
  private localTimer: number = 0;
  private timerEvent: Phaser.Time.TimerEvent | null = null;

  // Msg handler ref for cleanup
  private msgHandler: ((msg: ServerMsg) => void) | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { state: GameState; mapDef: GameMap; myId: string }) {
    this.gameState = data.state;
    this.mapDef = data.mapDef;
    this.myId = data.myId;
  }

  create() {
    // Graphics layers
    this.gridGfx = this.add.graphics();
    this.towerGfx = this.add.graphics();
    this.mobGfx = this.add.graphics();
    this.projectileGfx = this.add.graphics();

    this.drawGrid();
    this.createUI();

    // Grid click
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      const col = Math.floor((ptr.x - GRID_X) / CELL);
      const row = Math.floor((ptr.y - GRID_Y) / CELL);
      if (col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE) {
        this.onGridClick({ row, col });
      }
    });

    // Network
    this.msgHandler = (msg) => this.handleMsg(msg);
    socket.onMessage(this.msgHandler);

    this.updateUI();
  }

  shutdown() {
    if (this.msgHandler) socket.offMessage(this.msgHandler);
    if (this.timerEvent) this.timerEvent.destroy();
  }

  update() {
    this.drawMobs();
    this.drawTowers();
  }

  // ── Network ───────────────────────────────────────────

  private handleMsg(msg: ServerMsg) {
    switch (msg.type) {
      case 'STATE_UPDATE':
        this.gameState = msg.state;
        this.updateUI();
        break;

      case 'PHASE_CHANGE':
        this.gameState.phase = msg.phase;
        this.gameState.round = msg.round;
        this.startLocalTimer(msg.timer);
        this.updateUI();
        break;

      case 'SHOP_UPDATE': {
        const me = this.me();
        if (me) {
          me.shop = msg.shop;
          me.gold = msg.gold;
          this.updateUI();
        }
        break;
      }

      case 'MOB_SYNC':
        this.gameState.mobs = msg.mobs;
        break;

      case 'HEX_INCOMING':
        // Could flash a warning
        break;

      case 'PLAYER_ELIMINATED':
        this.updateUI();
        break;

      case 'GAME_OVER':
        socket.clearHandlers();
        this.scene.start('GameOverScene', {
          winnerId: msg.winnerId,
          players: this.gameState.players,
        });
        break;
    }
  }

  // ── Timer ─────────────────────────────────────────────

  private startLocalTimer(seconds: number) {
    this.localTimer = seconds;
    if (this.timerEvent) this.timerEvent.destroy();

    this.timerEvent = this.time.addEvent({
      delay: 1000,
      repeat: seconds - 1,
      callback: () => {
        this.localTimer = Math.max(0, this.localTimer - 1);
        this.updatePhaseText();
      },
    });
  }

  // ── Grid ──────────────────────────────────────────────

  private drawGrid() {
    const g = this.gridGfx;
    g.clear();

    const me = this.me();
    const playerTint = me ? PLAYER_COLOR_HEX[me.color] : '#4A90D9';
    const tintRGB = Phaser.Display.Color.HexStringToColor(playerTint);

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const x = GRID_X + col * CELL;
        const y = GRID_Y + row * CELL;
        const onPath = isPathCell(this.mapDef, { row, col });

        if (onPath) {
          g.fillStyle(0x2a2a4a, 1);
        } else {
          // Subtle player tint
          const base = new Phaser.Display.Color(28, 28, 54);
          const blended = Phaser.Display.Color.Interpolate.ColorWithColor(base, tintRGB, 100, 8);
          g.fillStyle(Phaser.Display.Color.GetColor(blended.r, blended.g, blended.b), 1);
        }

        g.fillRect(x, y, CELL, CELL);
        g.lineStyle(1, 0x333366, 0.4);
        g.strokeRect(x, y, CELL, CELL);
      }
    }

    // Path direction lines
    g.lineStyle(2, 0x4EA8DE, 0.25);
    for (let i = 0; i < this.mapDef.path.length - 1; i++) {
      const a = this.mapDef.path[i];
      const b = this.mapDef.path[i + 1];
      g.lineBetween(
        GRID_X + a.col * CELL + CELL / 2, GRID_Y + a.row * CELL + CELL / 2,
        GRID_X + b.col * CELL + CELL / 2, GRID_Y + b.row * CELL + CELL / 2,
      );
    }

    // Entry / Exit
    const entry = this.mapDef.entry;
    const exit = this.mapDef.exit;
    this.add.text(GRID_X + entry.col * CELL + 8, GRID_Y + entry.row * CELL + 22, '▶ IN', {
      fontSize: '12px', color: '#4AD97A', fontStyle: 'bold',
    });
    this.add.text(GRID_X + exit.col * CELL + 4, GRID_Y + exit.row * CELL + 22, '✕ EXIT', {
      fontSize: '11px', color: '#D94A4A', fontStyle: 'bold',
    });
  }

  // ── Mobs (redrawn every frame) ────────────────────────

  private drawMobs() {
    this.mobGfx.clear();
    const myMobs = this.gameState.mobs[this.myId] || [];

    for (const mob of myMobs) {
      const x = GRID_X + mob.x * CELL + CELL / 2;
      const y = GRID_Y + mob.y * CELL + CELL / 2;

      // Body
      const hpRatio = Math.max(0, mob.hp / mob.maxHp);
      const r = Math.floor(255 * (1 - hpRatio));
      const gr = Math.floor(255 * hpRatio);
      const color = Phaser.Display.Color.GetColor(r, gr, 60);

      const radius = mob.defId === 'boss' ? 16 : 10;
      const alpha = mob.visible ? 1 : 0.25;

      this.mobGfx.fillStyle(color, alpha);
      this.mobGfx.fillCircle(x, y, radius);

      // HP bar
      const barW = radius * 2;
      const barH = 3;
      const barX = x - radius;
      const barY = y - radius - 6;
      this.mobGfx.fillStyle(0x333333, 0.8);
      this.mobGfx.fillRect(barX, barY, barW, barH);
      this.mobGfx.fillStyle(0x44ff44, 0.9);
      this.mobGfx.fillRect(barX, barY, barW * hpRatio, barH);
    }
  }

  // ── Towers (redrawn every frame) ──────────────────────

  private drawTowers() {
    this.towerGfx.clear();
    const me = this.me();
    if (!me) return;

    for (const tower of me.towers) {
      const def = TOWER_MAP[tower.defId];
      if (!def) continue;

      const cx = GRID_X + tower.position.col * CELL + CELL / 2;
      const cy = GRID_Y + tower.position.row * CELL + CELL / 2;
      const elemColor = Phaser.Display.Color.HexStringToColor(
        ELEMENT_COLORS[tower.elements[0] || 'fire']
      ).color;

      // Tower body
      const size = 22;
      this.towerGfx.fillStyle(elemColor, 0.9);

      // Different shapes per element
      const elem = tower.elements[0];
      if (elem === 'fire' || elem === 'dark') {
        // Diamond
        this.towerGfx.fillTriangle(cx, cy - size, cx + size, cy, cx, cy + size);
        this.towerGfx.fillTriangle(cx, cy - size, cx - size, cy, cx, cy + size);
      } else if (elem === 'earth') {
        // Square
        this.towerGfx.fillRect(cx - size * 0.7, cy - size * 0.7, size * 1.4, size * 1.4);
      } else {
        // Circle
        this.towerGfx.fillCircle(cx, cy, size);
      }

      // Outline for starred towers
      if (tower.starLevel > 0) {
        this.towerGfx.lineStyle(2, 0xFFD93D, 1);
        this.towerGfx.strokeCircle(cx, cy, size + 3);
      }

      // Range circle (subtle)
      this.towerGfx.lineStyle(1, elemColor, 0.12);
      this.towerGfx.strokeCircle(cx, cy, def.range * CELL);
    }
  }

  // ── UI ────────────────────────────────────────────────

  private createUI() {
    const rightX = GRID_X + GRID_PX + 15;
    const shopY = GRID_Y + GRID_PX + 10;

    // ── Top bar (above grid)
    this.uiTopBar = this.add.text(GRID_X, 8, '', {
      fontSize: '15px', color: '#FFD93D', fontStyle: 'bold',
    });

    this.uiPhase = this.add.text(GRID_X + GRID_PX, 8, '', {
      fontSize: '15px', color: '#4EA8DE',
    }).setOrigin(1, 0);

    // ── Opponents (left sidebar)
    for (let i = 0; i < 3; i++) {
      this.uiOpponents.push(
        this.add.text(10, GRID_Y + i * 70, '', {
          fontSize: '13px', color: '#ccc',
          backgroundColor: '#0f3460',
          padding: { x: 8, y: 6 },
          fixedWidth: 185,
          wordWrap: { width: 175 },
        })
      );
    }

    // ── Hex info (left sidebar bottom)
    this.uiHexInfo = this.add.text(10, GRID_Y + 230, '', {
      fontSize: '12px', color: '#D94A4A',
      fixedWidth: 185,
      wordWrap: { width: 175 },
    });

    // ── Shop bar (below grid)
    this.add.text(GRID_X, shopY, 'SHOP', {
      fontSize: '11px', color: '#666', fontStyle: 'bold',
    });

    for (let i = 0; i < 5; i++) {
      const x = GRID_X + i * 104;
      const txt = this.add.text(x, shopY + 16, '', {
        fontSize: '12px', color: '#eee',
        backgroundColor: '#0f3460',
        padding: { x: 6, y: 5 },
        fixedWidth: 98,
        wordWrap: { width: 90 },
      })
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.buyTower(i));
      this.uiShopSlots.push(txt);
    }

    // Reroll + Level buttons
    const btnY = shopY + 16;
    this.add.text(GRID_X + 5 * 104 + 8, btnY, '🔄 Reroll 2g', {
      fontSize: '13px', color: '#1a1a2e', backgroundColor: '#FFD93D',
      padding: { x: 8, y: 8 },
    }).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => socket.send({ type: 'REROLL' }));

    this.add.text(GRID_X + 5 * 104 + 8, btnY + 36, '⬆️ Level Up 4g', {
      fontSize: '13px', color: '#1a1a2e', backgroundColor: '#4EA8DE',
      padding: { x: 8, y: 8 },
    }).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => socket.send({ type: 'LEVEL_UP' }));

    // ── Synergy bar
    this.uiSynergy = this.add.text(GRID_X, shopY + 62, '', {
      fontSize: '12px', color: '#aaa',
    });

    // ── Bench
    this.uiBench = this.add.text(GRID_X, shopY + 80, '', {
      fontSize: '12px', color: '#ccc',
    });
  }

  private updateUI() {
    const me = this.me();
    if (!me) return;

    // Top bar — keep it short, streak on right side
    this.uiTopBar.setText(
      `❤️ ${me.hp}   💰 ${me.gold}   Lv.${me.level} (${me.xp}/${me.xpToNext})`
    );

    this.updatePhaseText();

    // Shop
    for (let i = 0; i < 5; i++) {
      const defId = me.shop[i];
      if (defId) {
        const def = TOWER_MAP[defId];
        if (def) {
          const elems = def.elements.map((e) => ELEMENT_SYMBOLS[e]).join('');
          this.uiShopSlots[i]
            .setText(`${elems} ${def.name}\n${def.cost}g  T${def.tier}`)
            .setColor(ELEMENT_COLORS[def.elements[0]] || '#eee');
        }
      } else {
        this.uiShopSlots[i].setText('  — empty —').setColor('#444');
      }
    }

    // Synergies
    const parts: string[] = [];
    for (const [elem, count] of Object.entries(me.synergies)) {
      if (count > 0) {
        const sym = ELEMENT_SYMBOLS[elem as keyof typeof ELEMENT_SYMBOLS] || elem;
        parts.push(`${sym}×${count}`);
      }
    }
    this.uiSynergy.setText(`Synergies: ${parts.join('  ') || 'none yet'}`);

    // Bench
    if (me.bench.length > 0) {
      const benchNames = me.bench.map((id) => {
        const def = TOWER_MAP[id];
        return def ? `${ELEMENT_SYMBOLS[def.elements[0]]}${def.name}` : id;
      });
      this.uiBench.setText(`Bench (${me.bench.length}/8): ${benchNames.join(', ')}`);
    } else {
      this.uiBench.setText('Bench: empty — buy towers from shop ↑');
    }

    // Opponents
    const opponents = this.gameState.players.filter((p) => p.id !== this.myId);
    opponents.forEach((opp, i) => {
      if (i < this.uiOpponents.length) {
        const status = opp.alive ? `❤️ ${opp.hp} HP` : '💀 Out';
        const hex = opp.incomingHex ? `\n⚠️ Hex incoming!` : '';
        this.uiOpponents[i]
          .setText(`${opp.name}\n${status}  Lv.${opp.level}${hex}`)
          .setColor(PLAYER_COLOR_HEX[opp.color]);
      }
    });
    // Clear unused
    for (let i = opponents.length; i < this.uiOpponents.length; i++) {
      this.uiOpponents[i].setText('');
    }

    // Incoming hex warning
    if (me.incomingHex) {
      this.uiHexInfo.setText(`⚠️ INCOMING HEX\n${me.incomingHex.hexId.toUpperCase()}`);
    } else {
      this.uiHexInfo.setText('');
    }
  }

  private updatePhaseText() {
    const me = this.me();
    const streak = me ? me.streak : 0;
    const phase = this.gameState.phase === 'shopping' ? '🛒 SHOP' : '⚔️ COMBAT';
    const timer = this.gameState.phase === 'shopping' && this.localTimer > 0
      ? `⏱ ${this.localTimer}s`
      : '';
    this.uiPhase.setText(`R${this.gameState.round}/30  ${phase}  ${timer}  🔥${streak}`);
  }

  // ── Actions ───────────────────────────────────────────

  private buyTower(shopIndex: number) {
    if (this.gameState.phase !== 'shopping') return;
    socket.send({ type: 'BUY_TOWER', shopIndex });
  }

  private onGridClick(pos: GridPos) {
    if (this.gameState.phase !== 'shopping') return;
    const me = this.me();
    if (!me || me.bench.length === 0) return;
    if (isPathCell(this.mapDef, pos)) return;
    if (me.towers.some((t) => t.position.row === pos.row && t.position.col === pos.col)) return;

    socket.send({ type: 'PLACE_TOWER', benchIndex: 0, position: pos });
  }

  // ── Helpers ───────────────────────────────────────────

  private me(): PlayerState | undefined {
    return this.gameState.players.find((p) => p.id === this.myId);
  }
}
