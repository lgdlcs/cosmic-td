import Phaser from 'phaser';
import { socket } from '../network/socket';
import type {
  GameState,
  GameMap,
  ServerMsg,
  PlayerState,
  MobInstance,
  CombatAttack,
  GridPos,
} from '@ect/shared';
import {
  GRID_SIZE,
  TOWER_MAP,
  TOWER_DEFS,
  TOWER_COLORS,
  PLAYER_COLOR_HEX,
  TOWER_COLOR_HEX,
  isPathCell,
  getTowerStats,
  getTowerDisplayColor,
  AUGMENT_POOL,
  ELEMENT_EMOJI,
  ELEMENT_COLOR,
  ELEMENT_COLOR_HEX,
  getEffectiveness,
} from '@ect/shared';
import type { Element } from '@ect/shared';

// ── Procedural Sound Effects (Web Audio API) ───────────

class SoundFX {
  private ctx: AudioContext | null = null;
  muted: boolean = true;

  toggle(): boolean {
    this.muted = !this.muted;
    localStorage.setItem('ect_muted', this.muted ? '1' : '0');
    return this.muted;
  }

  constructor() {
    const saved = localStorage.getItem('ect_muted');
    this.muted = saved === null ? true : saved === '1';
  }

  private getCtx(): AudioContext | null {
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch { return null; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.15) {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  towerPlace() { this.tone(120, 0.15, 'triangle', 0.2); this.tone(80, 0.1, 'square', 0.1); }
  towerShoot(element: string) {
    const freqs: Record<string, number> = { arrow: 500, cannon: 150, income: 400, pvp: 200 };
    this.tone(freqs[element] || 400, 0.08, 'square', 0.08);
  }
  mobDeath() { this.tone(200, 0.1, 'square', 0.12); this.tone(100, 0.15, 'sawtooth', 0.1); }
  waveStart() { this.tone(440, 0.15, 'square', 0.15); setTimeout(() => this.tone(660, 0.2, 'square', 0.15), 150); }
  goldReceived() { this.tone(1200, 0.06, 'sine', 0.1); setTimeout(() => this.tone(1600, 0.06, 'sine', 0.1), 60); }
  leak() { this.tone(150, 0.3, 'sawtooth', 0.2); }
  augmentPick() { this.tone(800, 0.2, 'sine', 0.2); setTimeout(() => this.tone(1200, 0.3, 'sine', 0.15), 200); }
}

const sfx = new SoundFX();

const CELL = 32;
const GRID_X = 224;
const GRID_Y = 80;
const GRID_PX = CELL * GRID_SIZE;

// ── Visual effect structs ───────────────────────────────

interface Projectile {
  x: number; y: number;
  tx: number; ty: number;
  color: number;
  speed: number;
  alive: boolean;
  splash: boolean;
}

interface DeathEffect {
  x: number; y: number;
  radius: number;
  alpha: number;
  color: number;
}

interface DamageText {
  x: number; y: number;
  text: string;
  alpha: number;
  vy: number;
  obj?: Phaser.GameObjects.Text;
}

interface LeakEffect {
  x: number; y: number;
  alpha: number;
}

interface GridHover {
  position: GridPos;
  valid: boolean;
}

// ═══════════════════════════════════════════════════════

export class GameScene extends Phaser.Scene {
  private gameState!: GameState;
  private mapDef!: GameMap;
  private myId: string = '';

  // Graphics layers
  private gridGfx!: Phaser.GameObjects.Graphics;
  private previewGfx!: Phaser.GameObjects.Graphics;
  private towerGfx!: Phaser.GameObjects.Graphics;
  private mobGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private miniGfx!: Phaser.GameObjects.Graphics;

  // Visual effects
  private projectiles: Projectile[] = [];
  private deathEffects: DeathEffect[] = [];
  private damageTexts: DamageText[] = [];
  private leakEffects: LeakEffect[] = [];

  // Shop interaction state
  private selectedShopIndex: number = -1;
  private selectedTowerDefId: string | null = null;
  private gridHover: GridHover | null = null;
  private hoveredTower: string | null = null;

  // Augment pick overlay
  private augmentOverlay: Phaser.GameObjects.Container | null = null;
  private augmentChoices: { id: string; name: string; description: string; icon: string; tier: number }[] = [];

  // UI
  private uiTopLeft!: Phaser.GameObjects.Text;
  private uiTopRight!: Phaser.GameObjects.Text;
  private uiShopSlots: Phaser.GameObjects.Text[] = [];
  private uiAugmentList!: Phaser.GameObjects.Text;
  private uiOpponents: Phaser.GameObjects.Text[] = [];
  private uiMobCount!: Phaser.GameObjects.Text;
  private uiTowerHoverInfo!: Phaser.GameObjects.Text;

  // Timer
  private localTimer = 0;
  private timerEvent: Phaser.Time.TimerEvent | null = null;

  // Speed
  private speedButtons: Phaser.GameObjects.Text[] = [];
  private currentSpeed: number = 1;

  // Network handler
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
    this.gridGfx = this.add.graphics().setDepth(0);
    this.previewGfx = this.add.graphics().setDepth(0.5);
    this.towerGfx = this.add.graphics().setDepth(1);
    this.mobGfx = this.add.graphics().setDepth(2);
    this.fxGfx = this.add.graphics().setDepth(3);
    this.miniGfx = this.add.graphics().setDepth(4);

    this.projectiles = [];
    this.deathEffects = [];
    this.damageTexts = [];
    this.leakEffects = [];
    this.selectedShopIndex = -1;
    this.selectedTowerDefId = null;
    this.gridHover = null;
    this.hoveredTower = null;

    this.drawGrid();
    this.createUI();

    // Grid click
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.rightButtonDown()) {
        this.selectedShopIndex = -1;
        this.selectedTowerDefId = null;
        this.updateUI();
        return;
      }
      const col = Math.floor((ptr.x - GRID_X) / CELL);
      const row = Math.floor((ptr.y - GRID_Y) / CELL);
      if (col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE) {
        this.onGridClick({ row, col });
      }
    });

    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      this.updateGridHover(ptr);
      this.updateTowerHover(ptr);
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      this.selectedShopIndex = -1;
      this.selectedTowerDefId = null;
      this.updateUI();
    });

    this.msgHandler = (msg) => this.handleMsg(msg);
    socket.onMessage(this.msgHandler);
    this.updateUI();
  }

  shutdown() {
    if (this.msgHandler) socket.offMessage(this.msgHandler);
    if (this.timerEvent) this.timerEvent.destroy();
    if (this.augmentOverlay) this.augmentOverlay.destroy();
  }

  update(_time: number, delta: number) {
    this.updateProjectiles(delta);
    this.updateDeathEffects(delta);
    this.updateDamageTexts(delta);
    this.updateLeakEffects(delta);

    this.drawTowers();
    this.drawMobs();
    this.drawGridPreview();
    this.drawFX();
    this.drawOpponentMiniViews();

    if (this.gameState.phase === 'combat') {
      const mobs = this.gameState.mobs[this.myId] || [];
      this.uiMobCount.setText(`Mobs: ${mobs.length} remaining`);
    } else {
      this.uiMobCount.setText('');
    }
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
        if (msg.phase === 'combat') {
          this.hideAugmentOverlay();
          this.showPhaseFlash('⚔️ COMBAT');
          sfx.waveStart();
        } else if (msg.phase === 'shopping') {
          this.hideAugmentOverlay();
          this.showPhaseFlash(`🛒 ROUND ${msg.round}`);
        } else if (msg.phase === 'augmentPick') {
          this.showPhaseFlash('✨ AUGMENT PICK');
        }
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

      case 'COMBAT_EVENTS':
        if (msg.playerId === this.myId) {
          this.onCombatEvents(msg.attacks, msg.kills, msg.leaks);
        }
        break;

      case 'MOB_LEAKED':
        if (msg.playerId === this.myId) {
          const exit = this.mapDef.exit;
          const lx = GRID_X + exit.col * CELL + CELL / 2;
          const ly = GRID_Y + exit.row * CELL + CELL / 2;
          this.spawnFloatingText(lx + (Math.random() - 0.5) * 15, ly - 15, `-${msg.damage} HP`, -25);
        }
        break;

      case 'AUGMENT_CHOICES':
        this.augmentChoices = msg.choices;
        this.showAugmentOverlay();
        break;

      case 'AUGMENT_PICKED':
        if (msg.playerId === this.myId) {
          this.hideAugmentOverlay();
          sfx.augmentPick();
        }
        break;

      case 'SPEED_CHANGE':
        this.currentSpeed = msg.speed;
        this.updateSpeedButtons();
        break;

      case 'GAME_OVER':
        socket.clearHandlers();
        this.scene.start('GameOverScene', {
          winnerId: msg.winnerId,
          players: this.gameState.players,
          myId: this.myId,
        });
        break;
    }
  }

  // ── Augment Pick Overlay ──────────────────────────────

  private showAugmentOverlay() {
    this.hideAugmentOverlay();
    
    const cx = GRID_X + GRID_PX / 2;
    const cy = GRID_Y + GRID_PX / 2;
    
    this.augmentOverlay = this.add.container(0, 0).setDepth(20);
    
    // Dark backdrop
    const backdrop = this.add.rectangle(cx, cy, GRID_PX + 200, GRID_PX + 100, 0x000000, 0.8);
    this.augmentOverlay.add(backdrop);
    
    // Title
    const title = this.add.text(cx, cy - 180, `✨ Choose Your Augment — Round ${this.gameState.round}`, {
      fontSize: '24px', color: '#FFD93D', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.augmentOverlay.add(title);
    
    // Timer
    const timerText = this.add.text(cx, cy - 150, `⏱ ${this.localTimer}s`, {
      fontSize: '16px', color: '#aaa',
    }).setOrigin(0.5);
    this.augmentOverlay.add(timerText);
    
    // Update timer display
    const timerInterval = setInterval(() => {
      if (!this.augmentOverlay) { clearInterval(timerInterval); return; }
      timerText.setText(`⏱ ${this.localTimer}s`);
    }, 500);
    
    // Cards
    const cardW = 200;
    const cardH = 250;
    const gap = 20;
    const startX = cx - ((this.augmentChoices.length - 1) * (cardW + gap)) / 2;
    
    const tierColors: Record<number, number> = { 1: 0x336633, 2: 0x335588, 3: 0x883355 };
    const tierBorders: Record<number, number> = { 1: 0x44cc44, 2: 0x4488ff, 3: 0xff44aa };
    const tierLabels: Record<number, string> = { 1: 'TIER 1', 2: 'TIER 2', 3: 'TIER 3' };
    
    this.augmentChoices.forEach((aug, i) => {
      const cardX = startX + i * (cardW + gap);
      const cardY = cy + 20;
      
      // Card background
      const cardBg = this.add.rectangle(cardX, cardY, cardW, cardH, tierColors[aug.tier] || 0x333333, 0.9);
      cardBg.setStrokeStyle(3, tierBorders[aug.tier] || 0x888888);
      cardBg.setInteractive({ useHandCursor: true });
      this.augmentOverlay!.add(cardBg);
      
      // Tier label
      const tier = this.add.text(cardX, cardY - cardH / 2 + 20, tierLabels[aug.tier] || '', {
        fontSize: '11px', color: '#aaa', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.augmentOverlay!.add(tier);
      
      // Icon
      const icon = this.add.text(cardX, cardY - 40, aug.icon, {
        fontSize: '48px',
      }).setOrigin(0.5);
      this.augmentOverlay!.add(icon);
      
      // Name
      const name = this.add.text(cardX, cardY + 20, aug.name, {
        fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
        align: 'center',
      }).setOrigin(0.5);
      this.augmentOverlay!.add(name);
      
      // Description
      const desc = this.add.text(cardX, cardY + 55, aug.description, {
        fontSize: '12px', color: '#cccccc',
        align: 'center',
        wordWrap: { width: cardW - 20 },
      }).setOrigin(0.5);
      this.augmentOverlay!.add(desc);
      
      // Hover effect
      cardBg.on('pointerover', () => {
        cardBg.setStrokeStyle(4, 0xffd93d);
        cardBg.setScale(1.05);
      });
      cardBg.on('pointerout', () => {
        cardBg.setStrokeStyle(3, tierBorders[aug.tier] || 0x888888);
        cardBg.setScale(1);
      });
      
      // Click to pick
      cardBg.on('pointerdown', () => {
        socket.send({ type: 'PICK_AUGMENT', augmentId: aug.id });
      });
    });
  }

  private hideAugmentOverlay() {
    if (this.augmentOverlay) {
      this.augmentOverlay.destroy();
      this.augmentOverlay = null;
    }
  }

  // ── Combat Events → Visual Effects ────────────────────

  private onCombatEvents(attacks: CombatAttack[], kills: { mobId: string; x: number; y: number; gold: number }[], leaks: string[]) {
    for (const atk of attacks.slice(0, 3)) {
      sfx.towerShoot(atk.element);
    }

    for (const atk of attacks) {
      const sx = GRID_X + atk.towerX * CELL + CELL / 2;
      const sy = GRID_Y + atk.towerY * CELL + CELL / 2;
      const tx = GRID_X + atk.targetX * CELL + CELL / 2;
      const ty = GRID_Y + atk.targetY * CELL + CELL / 2;
      
      // Use element color if tower has element, otherwise tower type color
      let colorHex: string;
      if (atk.towerElement && ELEMENT_COLOR[atk.towerElement as Element]) {
        colorHex = ELEMENT_COLOR[atk.towerElement as Element];
      } else {
        colorHex = TOWER_COLOR_HEX[atk.element as keyof typeof TOWER_COLOR_HEX] || '#ffffff';
      }
      const color = Phaser.Display.Color.HexStringToColor(colorHex).color;

      this.projectiles.push({
        x: sx, y: sy, tx, ty,
        color,
        speed: 600,
        alive: true,
        splash: atk.splash,
      });

      // Effectiveness-colored damage text
      if (atk.effectiveness && atk.effectiveness !== 'neutral') {
        const effColor = atk.effectiveness === 'strong' ? '#FF4444' : '#888888';
        const effText = atk.effectiveness === 'strong' ? `${Math.round(atk.damage)}!` : `${Math.round(atk.damage)}`;
        this.spawnFloatingText(tx + (Math.random() - 0.5) * 8, ty - 12, effText, -20);
      }
    }

    if (kills.length > 0) sfx.mobDeath();
    if (kills.length > 0) sfx.goldReceived();
    for (const kill of kills) {
      const mx = GRID_X + kill.x * CELL + CELL / 2;
      const my = GRID_Y + kill.y * CELL + CELL / 2;
      this.deathEffects.push({ x: mx, y: my, radius: 8, alpha: 1, color: 0xFFD93D });
      this.spawnFloatingText(mx + (Math.random() - 0.5) * 10, my - 15, `+${kill.gold}g`, -30);
    }

    if (leaks.length > 0) sfx.leak();
    for (const _mobId of leaks) {
      const exit = this.mapDef.exit;
      const ex = GRID_X + exit.col * CELL + CELL / 2;
      const ey = GRID_Y + exit.row * CELL + CELL / 2;
      this.leakEffects.push({ x: ex, y: ey, alpha: 1 });
    }
  }

  // ── Effect Updates ────────────────────────────────────

  private updateProjectiles(dt: number) {
    const dtSec = dt / 1000;
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < p.speed * dtSec) p.alive = false;
      else {
        p.x += (dx / dist) * p.speed * dtSec;
        p.y += (dy / dist) * p.speed * dtSec;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  private updateDeathEffects(dt: number) {
    const dtSec = dt / 1000;
    for (const d of this.deathEffects) {
      d.radius += 80 * dtSec;
      d.alpha -= 2.5 * dtSec;
    }
    this.deathEffects = this.deathEffects.filter((d) => d.alpha > 0);
  }

  private spawnFloatingText(x: number, y: number, text: string, vy: number = -30) {
    try {
      const isGold = text.startsWith('+');
      const isLeak = text.includes('HP');
      const color = isGold ? '#FFD93D' : isLeak ? '#ff4444' : '#ffffff';
      const fontSize = isGold ? 16 : 13;
      const obj = this.add.text(x, y, text, {
        fontSize: `${fontSize}px`, color, fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(25);
      this.damageTexts.push({ x, y, text, alpha: 1, vy, obj });
    } catch { /* ignore if scene shutting down */ }
  }

  private updateDamageTexts(dt: number) {
    const dtSec = dt / 1000;
    for (const t of this.damageTexts) {
      t.y += t.vy * dtSec;
      t.alpha -= 1.2 * dtSec;
      if (t.obj) {
        t.obj.setPosition(t.x, t.y);
        t.obj.setAlpha(Math.max(0, t.alpha));
      }
    }
    this.damageTexts = this.damageTexts.filter((t) => {
      if (t.alpha <= 0) { t.obj?.destroy(); return false; }
      return true;
    });
  }

  private updateLeakEffects(dt: number) {
    const dtSec = dt / 1000;
    for (const l of this.leakEffects) l.alpha -= 2 * dtSec;
    this.leakEffects = this.leakEffects.filter((l) => l.alpha > 0);
  }

  private updateGridHover(ptr: Phaser.Input.Pointer) {
    if (this.gameState.phase === 'gameOver' || this.gameState.phase === 'lobby') {
      this.gridHover = null;
      return;
    }
    const col = Math.floor((ptr.x - GRID_X) / CELL);
    const row = Math.floor((ptr.y - GRID_Y) / CELL);

    if (col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE && this.selectedShopIndex >= 0) {
      const position = { row, col };
      const me = this.me();
      const isPath = isPathCell(this.mapDef, position);
      const isOccupied = me?.towers.some(t => t.position.row === row && t.position.col === col);
      this.gridHover = { position, valid: !isPath && !isOccupied };
    } else {
      this.gridHover = null;
    }
  }

  private updateTowerHover(ptr: Phaser.Input.Pointer) {
    const col = Math.floor((ptr.x - GRID_X) / CELL);
    const row = Math.floor((ptr.y - GRID_Y) / CELL);

    if (col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE) {
      const me = this.me();
      const tower = me?.towers.find(t => t.position.row === row && t.position.col === col);

      if (tower) {
        this.hoveredTower = tower.instanceId;
        const def = TOWER_MAP[tower.defId];
        if (def && me) {
          const elemTier = me.elements ? (me.elements.length >= 2 ? 2 : me.elements.length >= 1 ? 1 : 0) : 0;
          const activeElement = me.elements && me.elements.length > 0 ? me.elements[me.elements.length - 1] as Element : undefined;
          const stats = getTowerStats(def, tower.stars, me.augments, activeElement, elemTier);

          let info = `${stats.displayName}\n`;
          info += `${def.description}\n`;
          if (tower.element) {
            const emoji = ELEMENT_EMOJI[tower.element as Element] || '';
            info += `Element: ${emoji} ${tower.element}\n`;
          }
          if (stats.damage > 0) info += `DMG: ${stats.damage}  ATK SPD: ${stats.attackSpeed}/s  RANGE: ${stats.range}\n`;
          if (stats.splashRadius) info += `Splash: ${stats.splashRadius}\n`;
          if (stats.incomePerRound) info += `Income: +${stats.incomePerRound}g/round\n`;
          if (stats.mobPower) info += `PvP Power: ${stats.mobPower}\n`;

          if (this.gameState.phase === 'shopping') {
            const sellPrice = Math.floor((tower.stars >= 1 ? def.cost * 3 : def.cost) * 0.7);
            info += `\n💰 Click to sell (${sellPrice}g)`;
          }

          this.uiTowerHoverInfo.setText(info).setVisible(true);
          const tooltipX = Math.min(ptr.x + 15, this.scale.width - 250);
          const tooltipY = Math.max(ptr.y - 60, 10);
          this.uiTowerHoverInfo.setPosition(tooltipX, tooltipY);
        }
      } else {
        this.hoveredTower = null;
        this.uiTowerHoverInfo.setVisible(false);
      }
    } else {
      this.hoveredTower = null;
      this.uiTowerHoverInfo.setVisible(false);
    }
  }

  private drawGridPreview() {
    this.previewGfx.clear();

    if (this.gridHover && this.selectedShopIndex >= 0 && this.selectedTowerDefId) {
      const x = GRID_X + this.gridHover.position.col * CELL;
      const y = GRID_Y + this.gridHover.position.row * CELL;
      const cx = x + CELL / 2;
      const cy = y + CELL / 2;

      if (this.gridHover.valid) {
        this.previewGfx.fillStyle(0x44ff44, 0.3);
        this.previewGfx.lineStyle(2, 0x44ff44, 0.8);
      } else {
        this.previewGfx.fillStyle(0xff4444, 0.3);
        this.previewGfx.lineStyle(2, 0xff4444, 0.8);
      }
      this.previewGfx.fillRect(x, y, CELL, CELL);
      this.previewGfx.strokeRect(x, y, CELL, CELL);

      // Range preview
      const def = TOWER_MAP[this.selectedTowerDefId];
      if (def && this.gridHover.valid && def.range > 0) {
        const colorHex = TOWER_COLOR_HEX[def.towerType] || '#ffffff';
        const color = Phaser.Display.Color.HexStringToColor(colorHex).color;
        this.previewGfx.lineStyle(1, color, 0.2);
        this.previewGfx.strokeCircle(cx, cy, def.range * CELL);
      }
    }
  }

  // ── Draw FX Layer ─────────────────────────────────────

  private drawFX() {
    this.fxGfx.clear();
    for (const p of this.projectiles) {
      this.fxGfx.fillStyle(p.color, 0.9);
      this.fxGfx.fillCircle(p.x, p.y, p.splash ? 3 : 2);
    }
    for (const d of this.deathEffects) {
      this.fxGfx.lineStyle(2, d.color, d.alpha);
      this.fxGfx.strokeCircle(d.x, d.y, d.radius);
      this.fxGfx.fillStyle(d.color, d.alpha * 0.3);
      this.fxGfx.fillCircle(d.x, d.y, d.radius * 0.5);
    }
    for (const l of this.leakEffects) {
      this.fxGfx.fillStyle(0xff0000, l.alpha * 0.4);
      this.fxGfx.fillCircle(l.x, l.y, 18);
    }
  }

  // ── Grid ──────────────────────────────────────────────

  private drawGrid() {
    const g = this.gridGfx;
    g.clear();
    const me = this.me();
    const tintRGB = Phaser.Display.Color.HexStringToColor(
      me ? PLAYER_COLOR_HEX[me.color] : '#4A90D9'
    );

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const x = GRID_X + col * CELL;
        const y = GRID_Y + row * CELL;
        const onPath = isPathCell(this.mapDef, { row, col });
        if (onPath) {
          g.fillStyle(0x2a2a4a, 1);
        } else {
          const base = new Phaser.Display.Color(28, 28, 54);
          const blended = Phaser.Display.Color.Interpolate.ColorWithColor(base, tintRGB, 100, 8);
          g.fillStyle(Phaser.Display.Color.GetColor(blended.r, blended.g, blended.b), 1);
        }
        g.fillRect(x, y, CELL, CELL);
        g.lineStyle(1, 0x333366, 0.4);
        g.strokeRect(x, y, CELL, CELL);
      }
    }

    // Path lines
    g.lineStyle(2, 0x4EA8DE, 0.25);
    for (let i = 0; i < this.mapDef.path.length - 1; i++) {
      const a = this.mapDef.path[i];
      const b = this.mapDef.path[i + 1];
      g.lineBetween(
        GRID_X + a.col * CELL + CELL / 2, GRID_Y + a.row * CELL + CELL / 2,
        GRID_X + b.col * CELL + CELL / 2, GRID_Y + b.row * CELL + CELL / 2,
      );
    }

    const entry = this.mapDef.entry;
    const exit = this.mapDef.exit;
    this.add.text(GRID_X + entry.col * CELL + 8, GRID_Y + entry.row * CELL + 22, '▶ IN', {
      fontSize: '12px', color: '#4AD97A', fontStyle: 'bold',
    }).setDepth(0);
    this.add.text(GRID_X + exit.col * CELL + 4, GRID_Y + exit.row * CELL + 22, '✕ EXIT', {
      fontSize: '11px', color: '#D94A4A', fontStyle: 'bold',
    }).setDepth(0);
  }

  // ── Mobs ──────────────────────────────────────────────

  private drawMobs() {
    this.mobGfx.clear();
    const myMobs = this.gameState.mobs[this.myId] || [];

    for (const mob of myMobs) {
      const x = GRID_X + mob.x * CELL + CELL / 2;
      const y = GRID_Y + mob.y * CELL + CELL / 2;
      const hpRatio = Math.max(0, mob.hp / mob.maxHp);
      const alpha = mob.visible ? 1 : 0.2;

      let radius = 6;
      let borderColor = 0xffffff;
      let shape: 'circle' | 'square' | 'diamond' = 'circle';

      if (mob.defId === 'boss') { radius = 10; borderColor = 0xffd93d; }
      else if (mob.defId === 'tank') { radius = 8; borderColor = 0xff6666; shape = 'square'; }
      else if (mob.defId === 'runner') { radius = 5; borderColor = 0x66ff66; shape = 'diamond'; }
      else if (mob.defId === 'swarm') { radius = 4; borderColor = 0x66ccff; }

      const r = Math.floor(255 * (1 - hpRatio));
      const gr = Math.floor(200 * hpRatio + 55);
      const bodyColor = Phaser.Display.Color.GetColor(r, gr, 50);

      this.mobGfx.fillStyle(0x000000, alpha * 0.3);
      this.mobGfx.fillEllipse(x + 2, y + radius + 2, radius * 1.6, radius * 0.5);

      this.mobGfx.fillStyle(bodyColor, alpha);
      if (shape === 'square') {
        this.mobGfx.fillRect(x - radius * 0.7, y - radius * 0.7, radius * 1.4, radius * 1.4);
      } else if (shape === 'diamond') {
        this.mobGfx.fillTriangle(x, y - radius, x + radius, y, x, y + radius);
        this.mobGfx.fillTriangle(x, y - radius, x - radius, y, x, y + radius);
      } else {
        this.mobGfx.fillCircle(x, y, radius);
      }

      this.mobGfx.lineStyle(1.5, borderColor, alpha * 0.8);
      if (shape === 'square') {
        this.mobGfx.strokeRect(x - radius * 0.7, y - radius * 0.7, radius * 1.4, radius * 1.4);
      } else if (shape === 'diamond') {
        this.mobGfx.strokeTriangle(x, y - radius, x + radius, y, x, y + radius);
        this.mobGfx.strokeTriangle(x, y - radius, x - radius, y, x, y + radius);
      } else {
        this.mobGfx.strokeCircle(x, y, radius);
      }

      // HP bar
      const barW = radius * 2.2;
      const barH = 3;
      const barX = x - barW / 2;
      const barY = y - radius - 7;
      this.mobGfx.fillStyle(0x111111, 0.8);
      this.mobGfx.fillRect(barX, barY, barW, barH);
      const hpColor = hpRatio > 0.5 ? 0x44ff44 : hpRatio > 0.25 ? 0xffaa00 : 0xff3333;
      this.mobGfx.fillStyle(hpColor, 0.9);
      this.mobGfx.fillRect(barX, barY, barW * hpRatio, barH);

      // Element indicator on mob
      if (mob.element) {
        const eHex = ELEMENT_COLOR_HEX[mob.element as Element];
        if (eHex) {
          this.mobGfx.fillStyle(eHex, 0.7);
          this.mobGfx.fillCircle(x + radius + 3, y - radius - 3, 3);
        }
      }

      // Effect indicators
      let effX = x - 6;
      for (const eff of mob.effects) {
        if (eff.type === 'slow' && eff.value > 0) {
          this.mobGfx.fillStyle(0x4EA8DE, 0.7);
          this.mobGfx.fillCircle(effX, y + radius + 6, 3);
          effX += 6;
        }
        if (eff.type === 'burn') {
          this.mobGfx.fillStyle(0xFF6B35, 0.7);
          this.mobGfx.fillCircle(effX, y + radius + 6, 3);
          effX += 6;
        }
        if (eff.type === 'poison') {
          this.mobGfx.fillStyle(0x8844AA, 0.7);
          this.mobGfx.fillCircle(effX, y + radius + 6, 3);
          effX += 6;
        }
        if (eff.type === 'stun') {
          this.mobGfx.fillStyle(0xFFDD44, 0.9);
          this.mobGfx.fillCircle(x, y - radius - 5, 4);
        }
        if (eff.type === 'armorReduce') {
          this.mobGfx.fillStyle(0x8844AA, 0.5);
          this.mobGfx.fillCircle(effX, y + radius + 6, 3);
          effX += 6;
        }
      }
    }
  }

  // ── Towers ────────────────────────────────────────────

  private drawTowers() {
    this.towerGfx.clear();
    const me = this.me();
    if (!me) return;

    for (const tower of me.towers) {
      const def = TOWER_MAP[tower.defId];
      if (!def) continue;

      const cx = GRID_X + tower.position.col * CELL + CELL / 2;
      const cy = GRID_Y + tower.position.row * CELL + CELL / 2;
      const colorHex = getTowerDisplayColor(def.towerType, tower.element);
      const elemColor = Phaser.Display.Color.HexStringToColor(colorHex).color;
      const size = 12;
      const elemTier = me.elements ? (me.elements.length >= 2 ? 2 : me.elements.length >= 1 ? 1 : 0) : 0;
      const activeElement = me.elements && me.elements.length > 0 ? me.elements[me.elements.length - 1] : undefined;
      const stats = getTowerStats(def, tower.stars, me.augments, activeElement as Element | undefined, elemTier);

      // Range circle
      const isHovered = this.hoveredTower === tower.instanceId;
      if (stats.range > 0) {
        if (isHovered) {
          this.towerGfx.fillStyle(elemColor, 0.08);
          this.towerGfx.fillCircle(cx, cy, stats.range * CELL);
          this.towerGfx.lineStyle(2, elemColor, 0.5);
          this.towerGfx.strokeCircle(cx, cy, stats.range * CELL);
        } else {
          this.towerGfx.lineStyle(1, elemColor, 0.08);
          this.towerGfx.strokeCircle(cx, cy, stats.range * CELL);
        }
      }

      // Base platform
      this.towerGfx.fillStyle(0x111122, 0.6);
      this.towerGfx.fillCircle(cx, cy + 4, size + 2);

      // Tower shape by type
      this.towerGfx.fillStyle(elemColor, 0.9);
      switch (def.towerType) {
        case 'arrow':
          this.towerGfx.fillTriangle(cx, cy - size, cx - size * 0.8, cy + size * 0.6, cx + size * 0.8, cy + size * 0.6);
          break;
        case 'cannon':
          this.towerGfx.fillRect(cx - size * 0.7, cy - size * 0.7, size * 1.4, size * 1.4);
          break;
        case 'income':
          this.towerGfx.fillCircle(cx, cy, size * 0.8);
          // Gold symbol
          this.towerGfx.fillStyle(0x000000, 0.5);
          this.towerGfx.fillCircle(cx, cy, size * 0.4);
          break;
        case 'pvp':
          // Diamond shape
          this.towerGfx.fillTriangle(cx, cy - size, cx + size, cy, cx, cy + size);
          this.towerGfx.fillTriangle(cx, cy - size, cx - size, cy, cx, cy + size);
          break;
      }

      // Element glow
      if (tower.element) {
        const eColor = ELEMENT_COLOR_HEX[tower.element as Element];
        if (eColor) {
          this.towerGfx.lineStyle(2, eColor, 0.5);
          this.towerGfx.strokeCircle(cx, cy, size + 4);
          this.towerGfx.fillStyle(eColor, 0.12);
          this.towerGfx.fillCircle(cx, cy, size + 4);
        }
      }

      // Star indicator
      if (tower.stars >= 1) {
        this.towerGfx.lineStyle(2, 0xffd93d, 0.8);
        this.towerGfx.strokeCircle(cx, cy, size + 5);
        // Second glow
        this.towerGfx.lineStyle(1, 0xffd93d, 0.4);
        this.towerGfx.strokeCircle(cx, cy, size + 8);
      }
    }
  }

  // ── Timer ─────────────────────────────────────────────

  private startLocalTimer(seconds: number) {
    this.localTimer = seconds;
    if (this.timerEvent) this.timerEvent.destroy();
    if (seconds <= 0) return;
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      repeat: seconds - 1,
      callback: () => {
        this.localTimer = Math.max(0, this.localTimer - 1);
        this.updatePhaseText();
      },
    });
  }

  private showPhaseFlash(text: string) {
    const cx = GRID_X + GRID_PX / 2;
    const cy = GRID_Y + GRID_PX / 2;
    const flash = this.add.text(cx, cy, text, {
      fontSize: '40px', color: '#FFD93D', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10).setAlpha(1);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      y: cy - 40,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => flash.destroy(),
    });
  }

  private updateSpeedButtons() {
    const speeds = [1, 2, 3, 5, 10];
    this.speedButtons.forEach((btn, i) => {
      const s = speeds[i];
      const active = s === this.currentSpeed;
      btn.setStyle({
        color: active ? '#1a1a2e' : '#ccc',
        backgroundColor: active ? '#FFD93D' : '#2a2a3e',
      });
    });
  }

  // ── UI ────────────────────────────────────────────────

  private createUI() {
    const shopY = GRID_Y + GRID_PX + 12;

    // Top bar
    this.uiTopLeft = this.add.text(GRID_X, 10, '', {
      fontSize: '15px', color: '#FFD93D', fontStyle: 'bold',
    }).setDepth(5);

    this.uiTopRight = this.add.text(GRID_X + GRID_PX - 40, 10, '', {
      fontSize: '15px', color: '#4EA8DE',
    }).setOrigin(1, 0).setDepth(5);

    // Mute button
    const muteBtn = this.add.text(GRID_X + GRID_PX, 8, sfx.muted ? '🔇' : '🔊', {
      fontSize: '20px',
    }).setOrigin(1, 0).setDepth(5).setInteractive({ useHandCursor: true });
    muteBtn.on('pointerdown', () => {
      const muted = sfx.toggle();
      muteBtn.setText(muted ? '🔇' : '🔊');
    });

    // Mob count
    this.uiMobCount = this.add.text(GRID_X + GRID_PX, 30, '', {
      fontSize: '12px', color: '#888',
    }).setOrigin(1, 0).setDepth(5);

    // Opponents (left sidebar)
    for (let i = 0; i < 3; i++) {
      this.uiOpponents.push(
        this.add.text(10, GRID_Y + i * 70, '', {
          fontSize: '13px', color: '#ccc',
          backgroundColor: '#0f3460',
          padding: { x: 8, y: 6 },
          fixedWidth: 185,
          wordWrap: { width: 175 },
        }).setDepth(5)
      );
    }

    // Augment list (right sidebar)
    this.uiAugmentList = this.add.text(GRID_X + GRID_PX + 10, GRID_Y, '', {
      fontSize: '12px', color: '#ccc',
      backgroundColor: '#1a1a2e',
      padding: { x: 8, y: 6 },
      wordWrap: { width: 170 },
      lineSpacing: 4,
    }).setDepth(5);

    // Shop
    this.add.text(GRID_X, shopY - 2, 'SHOP — Buy 3 of same type → ★ upgrade', {
      fontSize: '11px', color: '#666', fontStyle: 'bold',
    }).setDepth(5);

    for (let i = 0; i < 5; i++) {
      const x = GRID_X + i * 104;
      const txt = this.add.text(x, shopY + 14, '', {
        fontSize: '12px', color: '#eee',
        backgroundColor: '#0f3460',
        padding: { x: 6, y: 5 },
        fixedWidth: 98,
        wordWrap: { width: 90 },
      })
        .setDepth(5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.selectShopSlot(i));
      this.uiShopSlots.push(txt);
    }

    // Buttons
    const btnX = GRID_X + 5 * 104 + 8;
    this.add.text(btnX, shopY + 14, '🔄 Reroll 2g', {
      fontSize: '13px', color: '#1a1a2e', backgroundColor: '#FFD93D',
      padding: { x: 8, y: 8 },
    }).setDepth(5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => socket.send({ type: 'REROLL' }));

    this.add.text(btnX, shopY + 86, '▶ SEND WAVE', {
      fontSize: '13px', color: '#1a1a2e', backgroundColor: '#D94A4A',
      padding: { x: 8, y: 8 },
    }).setDepth(5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => socket.send({ type: 'DEV_START_COMBAT' }));

    // Speed buttons
    const speeds = [1, 2, 3, 5, 10];
    this.speedButtons = [];
    const speedY = GRID_Y - 28;
    const speedStartX = GRID_X + GRID_PX - speeds.length * 34;
    speeds.forEach((s, i) => {
      const btn = this.add.text(speedStartX + i * 34, speedY, `×${s}`, {
        fontSize: '12px',
        color: s === 1 ? '#1a1a2e' : '#ccc',
        backgroundColor: s === 1 ? '#FFD93D' : '#2a2a3e',
        padding: { x: 5, y: 4 },
      }).setDepth(5).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => socket.send({ type: 'SET_SPEED', speed: s }));
      this.speedButtons.push(btn);
    });

    // Shop instruction
    this.add.text(GRID_X, shopY + 80, 'Click shop slot → Click grid to place | Click placed tower to sell', {
      fontSize: '11px', color: '#666', fontStyle: 'bold',
    }).setDepth(5);

    // Tower hover tooltip
    this.uiTowerHoverInfo = this.add.text(0, 0, '', {
      fontSize: '12px', color: '#ffffff',
      backgroundColor: '#1a1a2e',
      padding: { x: 8, y: 6 },
      stroke: '#ffd93d', strokeThickness: 1,
      fixedWidth: 240,
      wordWrap: { width: 220 },
    }).setOrigin(0, 0).setDepth(10);
  }

  private updateUI() {
    const me = this.me();
    if (!me) return;

    this.uiTopLeft.setText(`❤️ ${me.hp}   💰 ${me.gold}`);
    this.updatePhaseText();

    // Shop
    for (let i = 0; i < 5; i++) {
      const defId = me.shop[i];
      const isSelected = this.selectedShopIndex === i;

      if (defId) {
        const def = TOWER_MAP[defId];
        if (def) {
          const emoji: Record<string, string> = { arrow: '🏹', cannon: '💣', income: '💰', pvp: '👹' };
          const displayText = `${emoji[def.towerType] || ''} ${def.name}\n${def.cost}g`;
          const textColor = isSelected ? '#ffd93d' : '#eee';
          const bgColor = isSelected ? '#4a4a0a' : '#0f3460';
          this.uiShopSlots[i].setText(displayText).setColor(textColor).setBackgroundColor(bgColor);
        }
      } else {
        this.uiShopSlots[i].setText('  — empty —').setColor('#444').setBackgroundColor('#0f3460');
      }
    }

    // Augment list with element display
    const augLines: string[] = [];
    if (me.elements && me.elements.length > 0) {
      const activeElem = me.elements[me.elements.length - 1];
      const emoji = ELEMENT_EMOJI[activeElem as Element] || '';
      const tierLabel = me.elements.length >= 2 ? ' T2' : '';
      augLines.push(`⚡ ${emoji} ${activeElem.toUpperCase()}${tierLabel}`);
      augLines.push('');
    }
    augLines.push('✨ AUGMENTS');
    if (me.augments.length > 0) {
      for (const augId of me.augments) {
        const aug = AUGMENT_POOL.find(a => a.id === augId);
        if (aug) augLines.push(`${aug.icon} ${aug.name}`);
      }
    } else {
      augLines.push('  (none yet)');
    }
    this.uiAugmentList.setText(augLines.join('\n'));

    // Opponents
    const opponents = this.gameState.players.filter((p) => p.id !== this.myId);
    opponents.forEach((opp, i) => {
      if (i < this.uiOpponents.length) {
        const status = opp.alive ? `❤️ ${opp.hp}` : '💀';
        const augCount = opp.augments?.length || 0;
        this.uiOpponents[i]
          .setText(`${opp.name}\n${status}${augCount > 0 ? ` | ✨×${augCount}` : ''}`)
          .setColor(PLAYER_COLOR_HEX[opp.color]);
      }
    });
    for (let i = opponents.length; i < this.uiOpponents.length; i++) {
      this.uiOpponents[i].setText('');
    }
  }

  private updatePhaseText() {
    const me = this.me();
    const streak = me?.streak || 0;
    const phaseMap: Record<string, string> = {
      shopping: '🛒 SHOP',
      combat: '⚔️ COMBAT',
      augmentPick: '✨ AUGMENT',
    };
    const phase = phaseMap[this.gameState.phase] || this.gameState.phase;
    const timer = this.localTimer > 0 ? `⏱ ${this.localTimer}s` : '';
    const streakText = streak > 0 ? `  🔥×${streak}` : '';
    this.uiTopRight.setText(`📍 Round ${this.gameState.round}/30  ${phase}  ${timer}${streakText}`);
  }

  // ── Actions ───────────────────────────────────────────

  private selectShopSlot(shopIndex: number) {
    if (this.gameState.phase !== 'shopping') return;
    const me = this.me();
    if (!me || !me.shop[shopIndex]) return;

    if (this.selectedShopIndex === shopIndex) {
      this.selectedShopIndex = -1;
      this.selectedTowerDefId = null;
    } else {
      this.selectedShopIndex = shopIndex;
      this.selectedTowerDefId = me.shop[shopIndex];
    }
    this.updateUI();
  }

  private onGridClick(pos: GridPos) {
    if (this.gameState.phase !== 'shopping') return;
    const me = this.me();
    if (!me) return;

    // Click on existing tower = sell
    const existingTower = me.towers.find(t => t.position.row === pos.row && t.position.col === pos.col);
    if (existingTower) {
      socket.send({ type: 'SELL_TOWER', instanceId: existingTower.instanceId });
      return;
    }

    // Place tower from shop
    if (this.selectedShopIndex < 0 || !this.selectedTowerDefId) return;
    if (isPathCell(this.mapDef, pos)) return;

    socket.send({ type: 'BUY_AND_PLACE', shopIndex: this.selectedShopIndex, position: pos });
    sfx.towerPlace();
    this.selectedShopIndex = -1;
    this.selectedTowerDefId = null;
    this.updateUI();
  }

  // ── Opponent Mini-View ─────────────────────────────────

  private drawOpponentMiniViews() {
    this.miniGfx.clear();
    const opponents = this.gameState.players.filter(p => p.id !== this.myId && p.alive);
    const miniCell = 6;
    const miniSize = miniCell * GRID_SIZE;

    opponents.forEach((opp, idx) => {
      const baseX = GRID_X + GRID_PX + 20;
      const baseY = GRID_Y + 120 + idx * (miniSize + 50);

      this.miniGfx.fillStyle(0x0a0a1e, 0.8);
      this.miniGfx.fillRect(baseX - 2, baseY - 2, miniSize + 4, miniSize + 4);
      this.miniGfx.lineStyle(1, Phaser.Display.Color.HexStringToColor(PLAYER_COLOR_HEX[opp.color]).color, 0.6);
      this.miniGfx.strokeRect(baseX - 2, baseY - 2, miniSize + 4, miniSize + 4);

      for (const cell of this.mapDef.path) {
        this.miniGfx.fillStyle(0x2a2a4a, 0.5);
        this.miniGfx.fillRect(baseX + cell.col * miniCell, baseY + cell.row * miniCell, miniCell, miniCell);
      }

      for (const tower of opp.towers) {
        const def = TOWER_MAP[tower.defId];
        const colorHex = def ? TOWER_COLOR_HEX[def.towerType] : '#666666';
        const elemColor = Phaser.Display.Color.HexStringToColor(colorHex).color;
        this.miniGfx.fillStyle(elemColor, 0.9);
        this.miniGfx.fillRect(baseX + tower.position.col * miniCell + 1, baseY + tower.position.row * miniCell + 1, miniCell - 2, miniCell - 2);
      }

      const oppMobs = this.gameState.mobs[opp.id] || [];
      for (const mob of oppMobs) {
        this.miniGfx.fillStyle(0xff4444, 0.8);
        this.miniGfx.fillCircle(baseX + mob.x * miniCell + miniCell / 2, baseY + mob.y * miniCell + miniCell / 2, 2);
      }
    });
  }

  private me(): PlayerState | undefined {
    return this.gameState.players.find((p) => p.id === this.myId);
  }
}
