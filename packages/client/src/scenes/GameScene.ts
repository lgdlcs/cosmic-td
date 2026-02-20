import Phaser from 'phaser';
import { socket } from '../network/socket';
import type {
  GameState,
  GameMap,
  ServerMsg,
  PlayerState,
  MobInstance,
  TowerInstance,
  GridPos,
} from '@ect/shared';
import {
  GRID_SIZE,
  ELEMENT_COLORS,
  TOWER_MAP,
  PLAYER_COLOR_HEX,
  isPathCell,
} from '@ect/shared';

const CELL_SIZE = 64;
const GRID_OFFSET_X = 200;
const GRID_OFFSET_Y = 40;

export class GameScene extends Phaser.Scene {
  private gameState!: GameState;
  private mapDef!: GameMap;
  private myId: string = '';

  // Graphics layers
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private mobGraphics!: Phaser.GameObjects.Graphics;
  private towerSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private mobSprites: Map<string, Phaser.GameObjects.Arc> = new Map();

  // UI texts
  private topBarText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private shopTexts: Phaser.GameObjects.Text[] = [];
  private synergyText!: Phaser.GameObjects.Text;
  private opponentTexts: Phaser.GameObjects.Text[] = [];

  // Placement
  private selectedBenchIndex: number = -1;
  private hoverCell: GridPos | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { state: GameState; mapDef: GameMap; myId: string }) {
    this.gameState = data.state;
    this.mapDef = data.mapDef;
    this.myId = data.myId;
  }

  create() {

    this.gridGraphics = this.add.graphics();
    this.mobGraphics = this.add.graphics();

    // Draw grid
    this.drawGrid();

    // UI elements
    this.topBarText = this.add.text(10, 5, '', {
      fontSize: '16px',
      color: '#FFD93D',
      fontStyle: 'bold',
    });

    this.phaseText = this.add.text(this.cameras.main.centerX, 5, '', {
      fontSize: '16px',
      color: '#4EA8DE',
    }).setOrigin(0.5, 0);

    // Shop bar (bottom)
    const shopY = 660;
    this.add.text(200, shopY - 20, 'SHOP', { fontSize: '12px', color: '#888' });
    for (let i = 0; i < 5; i++) {
      const x = 200 + i * 120;
      const txt = this.add.text(x, shopY, '', {
        fontSize: '13px',
        color: '#eee',
        backgroundColor: '#0f3460',
        padding: { x: 8, y: 6 },
        fixedWidth: 110,
      })
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.buyTower(i));
      this.shopTexts.push(txt);
    }

    // Reroll button
    this.createButton(810, shopY, '🔄 2g', () => socket.send({ type: 'REROLL' }));

    // Level up button
    this.createButton(870, shopY, '⬆️ 4g', () => socket.send({ type: 'LEVEL_UP' }));

    // Synergy bar
    this.synergyText = this.add.text(200, shopY + 30, '', {
      fontSize: '12px',
      color: '#aaa',
    });

    // Opponent panel (left side)
    for (let i = 0; i < 3; i++) {
      this.opponentTexts.push(
        this.add.text(10, 50 + i * 60, '', {
          fontSize: '14px',
          color: '#ccc',
          backgroundColor: '#0f3460',
          padding: { x: 8, y: 6 },
          fixedWidth: 170,
        })
      );
    }

    // Grid click handler for tower placement
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const gridX = Math.floor((pointer.x - GRID_OFFSET_X) / CELL_SIZE);
      const gridY = Math.floor((pointer.y - GRID_OFFSET_Y) / CELL_SIZE);

      if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
        this.onGridClick({ row: gridY, col: gridX });
      }
    });

    // Listen for server messages
    socket.onMessage((msg) => this.handleMsg(msg));

    // Render loop
    this.updateUI();
  }

  update() {
    this.renderMobs();
    this.renderTowers();
  }

  // ── Message Handling ──────────────────────────────────

  private handleMsg(msg: ServerMsg) {
    switch (msg.type) {
      case 'STATE_UPDATE':
        this.gameState = msg.state;
        this.updateUI();
        break;
      case 'PHASE_CHANGE':
        this.gameState.phase = msg.phase;
        this.gameState.round = msg.round;
        this.gameState.timer = msg.timer;
        this.updateUI();
        break;
      case 'SHOP_UPDATE': {
        const me = this.getMyState();
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
      case 'MOB_KILLED':
      case 'MOB_LEAKED':
        // Handled via state updates
        break;
      case 'PLAYER_ELIMINATED':
        // Could show elimination animation
        break;
      case 'GAME_OVER':
        this.scene.start('GameOverScene', {
          winnerId: msg.winnerId,
          players: this.gameState.players,
        });
        break;
    }
  }

  // ── Grid Rendering ────────────────────────────────────

  private drawGrid() {
    const g = this.gridGraphics;
    g.clear();

    const me = this.getMyState();
    const tintColor = me ? Phaser.Display.Color.HexStringToColor(PLAYER_COLOR_HEX[me.color]) : null;

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const x = GRID_OFFSET_X + col * CELL_SIZE;
        const y = GRID_OFFSET_Y + row * CELL_SIZE;
        const onPath = isPathCell(this.mapDef, { row, col });

        if (onPath) {
          g.fillStyle(0x2a2a4a, 1);
        } else {
          const baseColor = tintColor
            ? Phaser.Display.Color.Interpolate.ColorWithColor(
                Phaser.Display.Color.HexStringToColor('#1e1e3a'),
                tintColor,
                100,
                10
              )
            : { r: 30, g: 30, b: 58, a: 255 };
          g.fillStyle(
            Phaser.Display.Color.GetColor(baseColor.r, baseColor.g, baseColor.b),
            1
          );
        }

        g.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        g.lineStyle(1, 0x333366, 0.5);
        g.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }

    // Draw path arrows
    g.lineStyle(2, 0x4EA8DE, 0.3);
    for (let i = 0; i < this.mapDef.path.length - 1; i++) {
      const from = this.mapDef.path[i];
      const to = this.mapDef.path[i + 1];
      const fx = GRID_OFFSET_X + from.col * CELL_SIZE + CELL_SIZE / 2;
      const fy = GRID_OFFSET_Y + from.row * CELL_SIZE + CELL_SIZE / 2;
      const tx = GRID_OFFSET_X + to.col * CELL_SIZE + CELL_SIZE / 2;
      const ty = GRID_OFFSET_Y + to.row * CELL_SIZE + CELL_SIZE / 2;
      g.lineBetween(fx, fy, tx, ty);
    }

    // Entry / Exit markers
    const entry = this.mapDef.entry;
    const exit = this.mapDef.exit;
    this.add.text(
      GRID_OFFSET_X + entry.col * CELL_SIZE + 10,
      GRID_OFFSET_Y + entry.row * CELL_SIZE + 20,
      'IN', { fontSize: '14px', color: '#4AD97A' }
    );
    this.add.text(
      GRID_OFFSET_X + exit.col * CELL_SIZE + 10,
      GRID_OFFSET_Y + exit.row * CELL_SIZE + 20,
      'EXIT', { fontSize: '12px', color: '#D94A4A' }
    );
  }

  // ── Mob Rendering ─────────────────────────────────────

  private renderMobs() {
    // Clear old mob sprites not in current state
    const currentMobIds = new Set<string>();
    const myMobs = this.gameState.mobs[this.myId] || [];

    for (const mob of myMobs) {
      currentMobIds.add(mob.instanceId);
      const x = GRID_OFFSET_X + mob.x * CELL_SIZE + CELL_SIZE / 2;
      const y = GRID_OFFSET_Y + mob.y * CELL_SIZE + CELL_SIZE / 2;

      let sprite = this.mobSprites.get(mob.instanceId);
      if (!sprite) {
        sprite = this.add.circle(x, y, 10, 0xff4444);
        this.mobSprites.set(mob.instanceId, sprite);
      } else {
        sprite.setPosition(x, y);
      }

      // HP-based color (green → red)
      const hpRatio = mob.hp / mob.maxHp;
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        new Phaser.Display.Color(255, 50, 50),
        new Phaser.Display.Color(50, 255, 50),
        100,
        Math.floor(hpRatio * 100)
      );
      sprite.setFillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b));

      if (!mob.visible) sprite.setAlpha(0.3);
      else sprite.setAlpha(1);
    }

    // Remove sprites for dead/leaked mobs
    for (const [id, sprite] of this.mobSprites) {
      if (!currentMobIds.has(id)) {
        sprite.destroy();
        this.mobSprites.delete(id);
      }
    }
  }

  // ── Tower Rendering ───────────────────────────────────

  private renderTowers() {
    const me = this.getMyState();
    if (!me) return;

    const currentIds = new Set(me.towers.map((t) => t.instanceId));

    // Remove old
    for (const [id, container] of this.towerSprites) {
      if (!currentIds.has(id)) {
        container.destroy();
        this.towerSprites.delete(id);
      }
    }

    // Add/update
    for (const tower of me.towers) {
      if (this.towerSprites.has(tower.instanceId)) continue;

      const def = TOWER_MAP[tower.defId];
      if (!def) continue;

      const x = GRID_OFFSET_X + tower.position.col * CELL_SIZE + CELL_SIZE / 2;
      const y = GRID_OFFSET_Y + tower.position.row * CELL_SIZE + CELL_SIZE / 2;
      const color = Phaser.Display.Color.HexStringToColor(
        ELEMENT_COLORS[tower.elements[0] || 'fire']
      ).color;

      // Tower shape based on element
      const shape = this.add.circle(x, y, 20, color);
      const label = this.add.text(x, y, def.name.charAt(0), {
        fontSize: '16px',
        color: '#fff',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      // Star indicator
      const stars = tower.starLevel > 0 ? '★'.repeat(tower.starLevel) : '';
      const starText = this.add.text(x, y - 25, stars, {
        fontSize: '12px',
        color: '#FFD93D',
      }).setOrigin(0.5);

      const container = this.add.container(0, 0, [shape, label, starText]);
      this.towerSprites.set(tower.instanceId, container);
    }
  }

  // ── UI Updates ────────────────────────────────────────

  private updateUI() {
    const me = this.getMyState();
    if (!me) return;

    // Top bar
    this.topBarText.setText(
      `HP: ${me.hp}  |  💰 ${me.gold}  |  Lv.${me.level} (${me.xp}/${me.xpToNext} XP)  |  🔥 Streak: ${me.streak}`
    );

    // Phase
    const phaseLabel = this.gameState.phase === 'shopping' ? '🛒 SHOP' : '⚔️ COMBAT';
    this.phaseText.setText(
      `Round ${this.gameState.round}/${30}  |  ${phaseLabel}  |  ⏱ ${this.gameState.timer}s`
    );

    // Shop
    for (let i = 0; i < 5; i++) {
      const defId = me.shop[i];
      if (defId) {
        const def = TOWER_MAP[defId];
        if (def) {
          const elem = def.elements.map((e) => e.charAt(0).toUpperCase()).join('+');
          this.shopTexts[i].setText(`${def.name}\n[${elem}] ${def.cost}g`);
          this.shopTexts[i].setColor(ELEMENT_COLORS[def.elements[0]] || '#eee');
        }
      } else {
        this.shopTexts[i].setText('—  empty').setColor('#555');
      }
    }

    // Synergies
    const synParts: string[] = [];
    for (const [elem, count] of Object.entries(me.synergies)) {
      if (count > 0) synParts.push(`${elem}×${count}`);
    }
    this.synergyText.setText(`Synergies: ${synParts.join(' | ') || 'none'}`);

    // Opponents
    const opponents = this.gameState.players.filter((p) => p.id !== this.myId);
    opponents.forEach((opp, i) => {
      if (i < this.opponentTexts.length) {
        const status = opp.alive ? `❤️ ${opp.hp}` : '💀 Eliminated';
        this.opponentTexts[i].setText(
          `${opp.name}\n${status}  |  Lv.${opp.level}`
        ).setColor(PLAYER_COLOR_HEX[opp.color]);
      }
    });
  }

  // ── Actions ───────────────────────────────────────────

  private buyTower(shopIndex: number) {
    if (this.gameState.phase !== 'shopping') return;
    socket.send({ type: 'BUY_TOWER', shopIndex });
  }

  private onGridClick(pos: GridPos) {
    if (this.gameState.phase !== 'shopping') return;

    const me = this.getMyState();
    if (!me || me.bench.length === 0) return;

    // Check not on path
    if (isPathCell(this.mapDef, pos)) return;

    // Check not occupied
    if (me.towers.some((t) => t.position.row === pos.row && t.position.col === pos.col)) return;

    // Place first bench tower
    socket.send({ type: 'PLACE_TOWER', benchIndex: 0, position: pos });
  }

  // ── Helpers ───────────────────────────────────────────

  private getMyState(): PlayerState | undefined {
    return this.gameState.players.find((p) => p.id === this.myId);
  }

  private createButton(x: number, y: number, label: string, onClick: () => void) {
    this.add.text(x, y, label, {
      fontSize: '14px',
      color: '#1a1a2e',
      backgroundColor: '#FFD93D',
      padding: { x: 8, y: 6 },
    })
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onClick);
  }
}
