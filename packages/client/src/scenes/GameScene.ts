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
  PvPQueueEntry,
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
  COMBO_DEFS,
  COMBO_MAP,
  getActiveCombo,
  PVP_UNIT_DEFS,
} from '@ect/shared';
import type { Element, TowerTier } from '@ect/shared';
import type { ElementCombo } from '@ect/shared';
import { findCombo, ALL_ELEMENTS } from '@ect/shared';

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

const FONT = "'Chakra Petch', 'Segoe UI', system-ui, sans-serif";
const CELL = 32;
const GRID_X = 224;
const GRID_Y = 80;
const GRID_PX = CELL * GRID_SIZE;

// Tower shop display colors (Feature 2)
const SHOP_TOWER_COLORS: Record<string, string> = {
  arrow: '#00d4ff',   // Blaster: cyan
  cannon: '#ff6b00',  // Railgun: red-orange
  income: '#ffc107',  // Arcane Tower: yellow
  pvp: '#7b2fbe',     // Warp Gate: purple
};

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

  // Tech tree overlay
  private techTreeOverlay: Phaser.GameObjects.Container | null = null;
  private techTreeVisible = false;

  // Old upgrade UI removed - replaced by Feature 5
  // Feature 5: Tower selection system (replacing upgrade button)
  private selectedTowerId: string | null = null;
  private towerActionMenu: Phaser.GameObjects.Container | null = null;

  // Feature 4: PvP queue
  private pvpQueue: PvPQueueEntry[] = [];
  private pvpTargetIndex: number = 0;

  // Feature 2: Next wave info
  private nextWaveInfo: { mobType: string; element?: Element; count: number; hp: number } | null = null;

  // Shop slot graphics for colored squares
  private shopSlotGraphics: Phaser.GameObjects.Graphics | null = null;
  private shopSlotGlowTimers: number[] = [0, 0, 0, 0, 0];

  // UI — DOM HUD overlay
  private hudEl: HTMLDivElement | null = null;
  private hudLeft: HTMLSpanElement | null = null;
  private hudCenter: HTMLSpanElement | null = null;
  private hudRight: HTMLSpanElement | null = null;
  private uiTowerHoverInfo!: Phaser.GameObjects.Text;

  // DOM UI overlay
  private gameUiEl: HTMLDivElement | null = null;
  private domShopSlots: HTMLDivElement[] = [];
  private domRerollBtn: HTMLDivElement | null = null;
  private domTechTreeBtn: HTMLDivElement | null = null;
  private domSendWaveBtn: HTMLDivElement | null = null;
  private domInstruction: HTMLDivElement | null = null;
  private domSpeedBtns: HTMLDivElement[] = [];
  private domAugmentList: HTMLDivElement | null = null;
  private domOpponents: HTMLDivElement[] = [];
  private domPvPPanel: HTMLDivElement | null = null;
  private domMobCount: HTMLSpanElement | null = null;
  private domShopLabel: HTMLDivElement | null = null;

  // Timer
  private localTimer = 0;
  private timerEvent: Phaser.Time.TimerEvent | null = null;

  // Speed
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

    // Feature 1: Keyboard shortcuts
    this.input.keyboard?.on('keydown-ESC', () => {
      this.selectedShopIndex = -1;
      this.selectedTowerDefId = null;
      this.selectedTowerId = null;
      this.hideTowerActionMenu();
      this.updateUI();
    });

    // Feature 1: TFT-style keyboard shortcuts
    this.input.keyboard?.on('keydown-D', () => {
      socket.send({ type: 'REROLL' });
    });

    this.input.keyboard?.on('keydown-E', () => {
      if (this.selectedTowerId) {
        socket.send({ type: 'SELL_TOWER', instanceId: this.selectedTowerId });
        this.selectedTowerId = null;
        this.hideTowerActionMenu();
      }
    });

    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.gameState.phase === 'shopping') {
        socket.send({ type: 'DEV_START_COMBAT' });
      }
    });

    // Feature 1: Shop slot selection (1-5)
    for (let i = 1; i <= 5; i++) {
      this.input.keyboard?.on(`keydown-${i}`, () => {
        this.selectShopSlot(i - 1);
      });
    }

    // Feature 1: Tab to cycle opponents (placeholder)
    this.input.keyboard?.on('keydown-TAB', (event: KeyboardEvent) => {
      event.preventDefault();
      // Cycle through opponent highlights in UI (visual only for now)
    });

    this.msgHandler = (msg) => this.handleMsg(msg);
    socket.onMessage(this.msgHandler);
    this.updateUI();
  }

  shutdown() {
    if (this.msgHandler) socket.offMessage(this.msgHandler);
    if (this.timerEvent) this.timerEvent.destroy();
    if (this.augmentOverlay) this.augmentOverlay.destroy();
    if (this.towerActionMenu) this.towerActionMenu.destroy();
    if (this.techTreeOverlay) this.techTreeOverlay.destroy();
    this.destroyHUD();
    this.destroyDOMUI();
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

    if (this.domMobCount) {
      if (this.gameState.phase === 'combat') {
        const mobs = this.gameState.mobs[this.myId] || [];
        this.domMobCount.textContent = `Mobs: ${mobs.length} remaining`;
      } else {
        this.domMobCount.textContent = '';
      }
    }
  }

  // ── Network ───────────────────────────────────────────

  private handleMsg(msg: ServerMsg) {
    switch (msg.type) {
      case 'STATE_UPDATE': {
        const hadColor = !!this.me();
        this.gameState = msg.state;
        // Redraw grid on first state with player color
        if (!hadColor && this.me()) this.drawGrid();
        this.updateUI();
        break;
      }

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
          this.showPhaseFlash('🔬 CHOOSE YOUR TECHNOLOGY');
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

      case 'TOWER_UPGRADED': {
        if (msg.playerId === this.myId) {
          // Upgrade animation
          const me = this.me();
          const tower = me?.towers.find(t => t.instanceId === msg.towerId);
          if (tower) {
            const cx = GRID_X + tower.position.col * CELL + CELL / 2;
            const cy = GRID_Y + tower.position.row * CELL + CELL / 2;
            this.showUpgradeAnimation(cx, cy, msg.newTier);
          }
          this.hideTowerActionMenu();
        }
        break;
      }

      case 'COMBO_UNLOCKED': {
        if (msg.playerId === this.myId) {
          this.showComboUnlockAnimation(msg.comboName, msg.comboColor);
        }
        break;
      }

      case 'ELEMENT_APPLIED':
        if (msg.playerId === this.myId) {
          this.hideTowerActionMenu();
        }
        break;

      case 'FIRST_CLEAR':
        if (msg.playerId === this.myId) {
          this.spawnFloatingText(480, 360, `⚡ FIRST CLEAR +${msg.bonus}g!`, -40);
          sfx.goldReceived();
        }
        break;

      case 'SPEED_CHANGE':
        this.currentSpeed = msg.speed;
        this.updateSpeedButtons();
        break;

      case 'NEXT_WAVE_INFO': // Feature 2: Next wave info
        this.nextWaveInfo = msg;
        break;

      case 'PVP_QUEUE_UPDATE': // Feature 4: PvP queue update
        this.pvpQueue = msg.queue;
        this.updatePvPPanel();
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
    const title = this.add.text(cx, cy - 180, `🔬 CHOOSE YOUR TECHNOLOGY — Round ${this.gameState.round}`, {
      fontFamily: FONT, fontSize: '24px', color: '#FFD93D', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.augmentOverlay.add(title);
    
    // Timer
    const timerText = this.add.text(cx, cy - 150, `⏱ ${this.localTimer}s`, {
      fontFamily: FONT, fontSize: '16px', color: '#aaa',
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
        fontFamily: FONT, fontSize: '11px', color: '#aaa', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.augmentOverlay!.add(tier);
      
      // Icon
      const icon = this.add.text(cardX, cardY - 40, aug.icon, {
        fontFamily: FONT, fontSize: '48px',
      }).setOrigin(0.5);
      this.augmentOverlay!.add(icon);
      
      // Name
      const name = this.add.text(cardX, cardY + 20, aug.name, {
        fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
        align: 'center',
      }).setOrigin(0.5);
      this.augmentOverlay!.add(name);
      
      // Description
      const desc = this.add.text(cardX, cardY + 55, aug.description, {
        fontFamily: FONT, fontSize: '12px', color: '#cccccc',
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
    const hasGold = kills.some(k => k.gold > 0);
    if (hasGold) sfx.goldReceived();
    for (const kill of kills) {
      const mx = GRID_X + kill.x * CELL + CELL / 2;
      const my = GRID_Y + kill.y * CELL + CELL / 2;
      this.deathEffects.push({ x: mx, y: my, radius: 8, alpha: 1, color: 0xFFD93D });
      if (kill.gold > 0) {
        this.spawnFloatingText(mx + (Math.random() - 0.5) * 10, my - 15, `+${kill.gold}g`, -30);
      }
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

          const tierLabel = tower.stars >= 3 ? ' [T3]' : tower.stars >= 2 ? ' [T2]' : ' [T1]';
          let info = `${stats.displayName}${tierLabel}\n`;
          info += `${def.description}\n`;
          if (tower.element) {
            info += `Element: ${tower.element}\n`;
          }
          const meForCombo = this.me();
          if (meForCombo?.activeCombo) {
            const combo = COMBO_MAP[meForCombo.activeCombo];
            if (combo) info += `Combo: ${combo.name}\n`;
          }
          if (stats.damage > 0) info += `DMG: ${stats.damage}  ATK SPD: ${stats.attackSpeed}/s  RANGE: ${stats.range}\n`;
          if (stats.splashRadius) info += `Splash: ${stats.splashRadius}\n`;
          if (stats.incomePerRound) info += `Income: +${stats.incomePerRound}g/round\n`;
          if (stats.mobPower) info += `PvP Power: ${stats.mobPower}\n`;

          {
            if (tower.canUpgrade) {
              info += `\n⬆ Click to UPGRADE`;
            } else {
              const copies = tower.stars >= 3 ? 9 : tower.stars >= 2 ? 3 : 1;
              const sellPrice = Math.floor(def.cost * copies * 0.7);
              info += `\nClick to sell (${sellPrice}g)`;
            }
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

  private getMyColorHex(): number {
    const me = this.me();
    if (!me) return 0x00d4ff;
    const map: Record<string, number> = { blue: 0x4A90D9, red: 0xD94A4A, green: 0x4AD97A, orange: 0xD9A04A };
    return map[me.color] || 0x00d4ff;
  }

  private drawGrid() {
    const g = this.gridGfx;
    g.clear();

    const pColor = this.getMyColorHex();

    // Deep space background
    g.fillStyle(0x0a0a14, 1);
    g.fillRect(GRID_X - 2, GRID_Y - 2, GRID_PX + 4, GRID_PX + 4);

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const x = GRID_X + col * CELL;
        const y = GRID_Y + row * CELL;
        const onPath = isPathCell(this.mapDef, { row, col });
        if (onPath) {
          // Metallic dark path with player color glow edges
          g.fillStyle(0x15152a, 1);
          g.fillRect(x, y, CELL, CELL);
          g.lineStyle(1, pColor, 0.12);
          g.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
        } else {
          // Placeable tiles - slightly lighter with grid dots
          g.fillStyle(0x0e0e20, 1);
          g.fillRect(x, y, CELL, CELL);
          // Grid dot in player color
          g.fillStyle(pColor, 0.25);
          g.fillCircle(x + CELL / 2, y + CELL / 2, 1);
        }
        g.lineStyle(1, 0x1a1a3a, 0.5);
        g.strokeRect(x, y, CELL, CELL);
      }
    }

    // Path lines - player color glow
    g.lineStyle(2, pColor, 0.2);
    for (let i = 0; i < this.mapDef.path.length - 1; i++) {
      const a = this.mapDef.path[i];
      const b = this.mapDef.path[i + 1];
      g.lineBetween(
        GRID_X + a.col * CELL + CELL / 2, GRID_Y + a.row * CELL + CELL / 2,
        GRID_X + b.col * CELL + CELL / 2, GRID_Y + b.row * CELL + CELL / 2,
      );
    }

    // Starfield overlay
    for (let i = 0; i < 80; i++) {
      const sx = GRID_X + Math.random() * GRID_PX;
      const sy = GRID_Y + Math.random() * GRID_PX;
      const brightness = 0.15 + Math.random() * 0.35;
      g.fillStyle(0xffffff, brightness);
      g.fillCircle(sx, sy, Math.random() < 0.3 ? 1.5 : 0.8);
    }

    // Nebula glow patches in player color
    g.fillStyle(pColor, 0.04);
    g.fillCircle(GRID_X + GRID_PX * 0.3, GRID_Y + GRID_PX * 0.2, 60);
    g.fillStyle(pColor, 0.03);
    g.fillCircle(GRID_X + GRID_PX * 0.7, GRID_Y + GRID_PX * 0.8, 80);

    const entry = this.mapDef.entry;
    const exit = this.mapDef.exit;
    this.add.text(GRID_X + entry.col * CELL + 8, GRID_Y + entry.row * CELL + 22, '▶ IN', {
      fontFamily: FONT, fontSize: '12px', color: '#00ff88', fontStyle: 'bold',
    }).setDepth(0);
    this.add.text(GRID_X + exit.col * CELL + 4, GRID_Y + exit.row * CELL + 22, '✕ EXIT', {
      fontFamily: FONT, fontSize: '11px', color: '#ff4444', fontStyle: 'bold',
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

      // PvP mobs: purple tint + flying = triangle pointing up
      const isPvp = (mob as any).isPvp;
      const isFlying = (mob as any).isFlying;
      if (isPvp) borderColor = 0x9B5DE5;
      if (isFlying) shape = 'diamond'; // triangle shape for flyers

      const r = isPvp ? 155 : Math.floor(255 * (1 - hpRatio));
      const gr = isPvp ? 93 : Math.floor(200 * hpRatio + 55);
      const b = isPvp ? 229 : 50;
      const bodyColor = Phaser.Display.Color.GetColor(r, gr, b);

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
      // Use tower's own combo/element color, or default tower color
      let colorHex = getTowerDisplayColor(def.towerType, tower.element);
      if (tower.combo) {
        const combo = COMBO_MAP[tower.combo];
        if (combo) colorHex = combo.color;
      }
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

      // Star indicator (T2 = ★★, T3 = ★★★)
      if (tower.stars >= 2) {
        this.towerGfx.lineStyle(2, 0xffd93d, 0.8);
        this.towerGfx.strokeCircle(cx, cy, size + 5);
        if (tower.stars >= 3) {
          this.towerGfx.lineStyle(2, 0xff4488, 0.9);
          this.towerGfx.strokeCircle(cx, cy, size + 8);
          this.towerGfx.lineStyle(1, 0xff4488, 0.5);
          this.towerGfx.strokeCircle(cx, cy, size + 11);
        } else {
          this.towerGfx.lineStyle(1, 0xffd93d, 0.4);
          this.towerGfx.strokeCircle(cx, cy, size + 8);
        }
      }

      // Star dots above tower
      if (tower.stars >= 2) {
        const starColor = tower.stars >= 3 ? 0xff4488 : 0xffd93d;
        this.towerGfx.fillStyle(starColor, 0.95);
        const starY = cy - size - 6;
        if (tower.stars === 2) {
          this.towerGfx.fillCircle(cx - 3, starY, 2);
          this.towerGfx.fillCircle(cx + 3, starY, 2);
        } else {
          this.towerGfx.fillCircle(cx - 5, starY, 2);
          this.towerGfx.fillCircle(cx, starY, 2);
          this.towerGfx.fillCircle(cx + 5, starY, 2);
        }
      }

      // canUpgrade indicator: green pulsing border
      if (tower.canUpgrade) {
        const pulse = 0.4 + 0.4 * Math.sin(Date.now() / 300);
        this.towerGfx.lineStyle(2, 0x44ff44, pulse);
        this.towerGfx.strokeCircle(cx, cy, size + 6);
      }

      // Feature 5: Selected tower highlight
      if (this.selectedTowerId === tower.instanceId) {
        this.towerGfx.lineStyle(3, 0x00d4ff, 0.9);
        this.towerGfx.strokeCircle(cx, cy, size + 10);
        // Always show range for selected tower
        if (stats.range > 0) {
          this.towerGfx.fillStyle(elemColor, 0.1);
          this.towerGfx.fillCircle(cx, cy, stats.range * CELL);
          this.towerGfx.lineStyle(2, elemColor, 0.6);
          this.towerGfx.strokeCircle(cx, cy, stats.range * CELL);
        }
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
      fontFamily: FONT, fontSize: '40px', color: '#00d4ff', fontStyle: 'bold',
      stroke: '#7b2fbe', strokeThickness: 4,
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
    this.domSpeedBtns.forEach((btn, i) => {
      const s = speeds[i];
      const active = s === this.currentSpeed;
      btn.style.color = active ? '#0a0a14' : '#7a8aaa';
      btn.style.background = active ? '#00d4ff' : '#12122a';
    });
  }

  // ── UI ────────────────────────────────────────────────

  private createUI() {
    // Top bar — DOM overlay with flexbox
    this.createHUD();
    // All game UI as DOM overlay
    this.createDOMUI();

    // Tower hover tooltip (keep as Phaser - follows mouse precisely)
    this.uiTowerHoverInfo = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '12px', color: '#ffffff',
      backgroundColor: '#0d1117cc',
      padding: { x: 8, y: 6 },
      stroke: '#00d4ff', strokeThickness: 1,
      fixedWidth: 240,
      wordWrap: { width: 220 },
    }).setOrigin(0, 0).setDepth(10);
  }

  // ── DOM UI Overlay ────────────────────────────────────

  private createDOMUI() {
    this.destroyDOMUI();
    const container = this.game.canvas.parentElement;
    if (!container) return;
    container.style.position = 'relative';

    const W = 960, H = 720;
    const pct = (gx: number, gy: number) => ({ left: `${(gx / W * 100).toFixed(2)}%`, top: `${(gy / H * 100).toFixed(2)}%` });

    // Root overlay
    const root = document.createElement('div');
    root.id = 'game-ui';
    Object.assign(root.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '5',
      fontFamily: "'Chakra Petch', system-ui, sans-serif", color: '#e0e8ff', fontSize: '12px',
    });
    container.appendChild(root);
    this.gameUiEl = root;

    const mkDiv = (parent: HTMLElement, styles: Record<string, string> = {}): HTMLDivElement => {
      const d = document.createElement('div');
      Object.assign(d.style, styles);
      parent.appendChild(d);
      return d;
    };

    const btnBase: Record<string, string> = {
      pointerEvents: 'auto', cursor: 'pointer', borderRadius: '6px',
      fontFamily: "'Chakra Petch', system-ui, sans-serif", fontWeight: '600',
      userSelect: 'none', textAlign: 'center', whiteSpace: 'nowrap',
    };

    // ── Mute button (top-right of grid area) ──
    const mutePos = pct(GRID_X + GRID_PX - 30, 42);
    const muteBtn = mkDiv(root, {
      ...btnBase, position: 'absolute', ...mutePos,
      fontSize: '18px', padding: '2px',
    });
    muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
    muteBtn.onclick = () => { const m = sfx.toggle(); muteBtn.textContent = m ? '🔇' : '🔊'; };

    // ── Mob count ──
    const mobPos = pct(GRID_X + GRID_PX - 140, 46);
    this.domMobCount = mkDiv(root, {
      position: 'absolute', ...mobPos, fontSize: '11px', color: '#888',
    }) as HTMLSpanElement;

    // ── Speed buttons ──
    const speedY = GRID_Y - 28;
    const speeds = [1, 2, 3, 5, 10];
    const speedStartX = GRID_X + GRID_PX - speeds.length * 34;
    this.domSpeedBtns = [];
    speeds.forEach((s, i) => {
      const sp = pct(speedStartX + i * 34, speedY);
      const btn = mkDiv(root, {
        ...btnBase, position: 'absolute', ...sp,
        fontSize: '12px', padding: '3px 5px',
        color: s === 1 ? '#0a0a14' : '#7a8aaa',
        background: s === 1 ? '#00d4ff' : '#12122a',
        border: '1px solid rgba(0,212,255,0.3)',
      });
      btn.textContent = `×${s}`;
      btn.onclick = () => socket.send({ type: 'SET_SPEED', speed: s });
      this.domSpeedBtns.push(btn);
    });

    // ── Opponents (left sidebar) ──
    this.domOpponents = [];
    for (let i = 0; i < 3; i++) {
      const op = pct(10, GRID_Y + i * 70);
      const d = mkDiv(root, {
        position: 'absolute', ...op, fontSize: '13px', color: '#e0e8ff',
        background: 'rgba(13,17,23,0.9)', padding: '6px 8px',
        borderRadius: '6px', border: '1px solid rgba(0,212,255,0.2)',
        width: '185px', lineHeight: '1.4',
      });
      this.domOpponents.push(d);
    }

    // ── PvP Panel (left sidebar, below opponents) ──
    const pvpPos = pct(10, GRID_Y + 300);
    this.domPvPPanel = mkDiv(root, {
      position: 'absolute', ...pvpPos,
      background: 'rgba(13,17,23,0.9)', padding: '8px',
      borderRadius: '6px', border: '2px solid rgba(123,47,190,0.6)',
      width: '200px', pointerEvents: 'auto',
    });
    this.buildPvPPanelDOM();

    // ── Augment list (right sidebar) ──
    const augPos = pct(GRID_X + GRID_PX + 10, GRID_Y);
    this.domAugmentList = mkDiv(root, {
      position: 'absolute', ...augPos, fontSize: '12px', color: '#e0e8ff',
      background: 'rgba(13,17,23,0.9)', padding: '6px 8px',
      borderRadius: '6px', border: '1px solid rgba(0,212,255,0.2)',
      width: '180px', lineHeight: '1.5',
    });

    // ── Shop area ──
    const shopY = GRID_Y + GRID_PX + 12;
    
    // Shop label
    const labelPos = pct(GRID_X, shopY - 2);
    this.domShopLabel = mkDiv(root, {
      position: 'absolute', ...labelPos,
      fontSize: '11px', color: '#666', fontWeight: '700',
    });
    this.domShopLabel.textContent = 'SPACE STATION — Buy 3 of same type → ★ upgrade';

    // Shop slots
    this.domShopSlots = [];
    for (let i = 0; i < 5; i++) {
      const x = GRID_X + i * 104;
      // Keybind hint
      const hintPos = pct(x + 38, shopY + 1);
      mkDiv(root, {
        position: 'absolute', ...hintPos,
        fontSize: '10px', color: '#666', fontWeight: '700',
        width: '22px', textAlign: 'center',
      }).textContent = `[${i + 1}]`;

      // Slot
      const slotPos = pct(x, shopY + 14);
      const slot = mkDiv(root, {
        ...btnBase, position: 'absolute', ...slotPos,
        fontSize: '14px', color: '#e0e8ff',
        background: 'rgba(13,17,23,0.9)', padding: '8px 8px',
        width: '110px', minHeight: '40px',
        border: '1px solid rgba(0,212,255,0.3)',
        lineHeight: '1.3', textAlign: 'left',
      });
      const idx = i;
      slot.onclick = () => this.selectShopSlot(idx);
      this.domShopSlots.push(slot);
    }

    // ── Buttons ──
    const btnX = GRID_X + 5 * 104 + 8;

    // Reroll
    const rerollPos = pct(btnX, shopY + 14);
    this.domRerollBtn = mkDiv(root, {
      ...btnBase, position: 'absolute', ...rerollPos,
      fontSize: '13px', color: '#0a0a14', background: '#ffc107',
      padding: '7px 10px',
    });
    this.domRerollBtn.textContent = '🔄 [D] Reroll 2g';
    this.domRerollBtn.onclick = () => socket.send({ type: 'REROLL' });

    // Tech Tree
    const techPos = pct(btnX, shopY + 50);
    this.domTechTreeBtn = mkDiv(root, {
      ...btnBase, position: 'absolute', ...techPos,
      fontSize: '13px', color: '#e0e8ff', background: '#7b2fbe',
      padding: '7px 10px',
    });
    this.domTechTreeBtn.textContent = 'TECH TREE';
    this.domTechTreeBtn.onclick = () => this.showTechTree();

    // Send Wave
    const wavePos = pct(btnX, shopY + 86);
    this.domSendWaveBtn = mkDiv(root, {
      ...btnBase, position: 'absolute', ...wavePos,
      fontSize: '13px', color: '#e0e8ff', background: '#ff4444',
      padding: '7px 10px',
    });
    this.domSendWaveBtn.textContent = '▶ [Space] Send Wave';
    this.domSendWaveBtn.onclick = () => socket.send({ type: 'DEV_START_COMBAT' });

    // Instruction
    const instrPos = pct(GRID_X, shopY + 80);
    this.domInstruction = mkDiv(root, {
      position: 'absolute', ...instrPos,
      fontSize: '11px', color: '#666', fontWeight: '700',
    });
    this.domInstruction.textContent = '[1-5] Select shop | Click grid to place | Click tower for menu | [E] to sell selected';
  }

  private buildPvPPanelDOM() {
    const panel = this.domPvPPanel;
    if (!panel) return;
    panel.innerHTML = '';

    const title = document.createElement('div');
    Object.assign(title.style, { fontSize: '14px', color: '#7b2fbe', fontWeight: '700', textAlign: 'center', marginBottom: '6px' });
    title.textContent = 'WARP GATE';
    panel.appendChild(title);

    // PvP Points display
    const pointsDisplay = document.createElement('div');
    Object.assign(pointsDisplay.style, { fontSize: '12px', color: '#9B5DE5', textAlign: 'center', marginBottom: '8px' });
    pointsDisplay.textContent = '⚡ 0 pts';
    panel.appendChild(pointsDisplay);
    (panel as any)._pointsDisplay = pointsDisplay;

    const unitTypes = ['basic', 'flying', 'boss'];
    const unitNames = ['Send Unit', 'Send Flyer', 'Send Boss'];
    const unitCosts = [3, 8, 10];
    const unitDescs = ['Round type ×1.5 HP', 'Ignores path, fast', 'Massive HP ×5'];

    unitTypes.forEach((unitType, i) => {
      const btn = document.createElement('div');
      Object.assign(btn.style, {
        fontSize: '11px', color: '#e0e8ff', background: '#7b2fbe',
        padding: '4px 6px', marginBottom: '4px', borderRadius: '4px',
        cursor: 'pointer', pointerEvents: 'auto', lineHeight: '1.3',
      });
      btn.innerHTML = `${unitNames[i]} <span style="color:#ffc107">(${unitCosts[i]}pts)</span><br><span style="font-size:9px;color:#aaa">${unitDescs[i]}</span>`;
      btn.onclick = () => this.queuePvPUnit(unitType);
      panel.appendChild(btn);
      (panel as any)[`_pvpBtn${i}`] = btn;
    });

    const targetRow = document.createElement('div');
    Object.assign(targetRow.style, { fontSize: '11px', color: '#aaa', marginTop: '6px' });
    targetRow.innerHTML = 'Target: ';
    const targetBtn = document.createElement('span');
    Object.assign(targetBtn.style, { color: '#00d4ff', cursor: 'pointer', pointerEvents: 'auto', background: '#0d1117', padding: '1px 4px', borderRadius: '3px' });
    targetBtn.textContent = 'Click to cycle';
    targetBtn.onclick = () => this.cycleTarget();
    targetRow.appendChild(targetBtn);
    panel.appendChild(targetRow);
    (panel as any)._targetBtn = targetBtn;

    const queueLabel = document.createElement('div');
    Object.assign(queueLabel.style, { fontSize: '10px', color: '#666', marginTop: '4px' });
    queueLabel.textContent = 'Queue: (empty)';
    panel.appendChild(queueLabel);
    (panel as any)._queueLabel = queueLabel;
  }

  private destroyDOMUI() {
    if (this.gameUiEl) {
      this.gameUiEl.remove();
      this.gameUiEl = null;
    }
    this.domShopSlots = [];
    this.domRerollBtn = null;
    this.domTechTreeBtn = null;
    this.domSendWaveBtn = null;
    this.domInstruction = null;
    this.domSpeedBtns = [];
    this.domAugmentList = null;
    this.domOpponents = [];
    this.domPvPPanel = null;
    this.domMobCount = null;
    this.domShopLabel = null;
  }

  private createHUD() {
    this.destroyHUD();
    const hud = document.createElement('div');
    hud.id = 'game-hud';
    Object.assign(hud.style, {
      position: 'absolute', top: '0', left: '0',
      display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap',
      gap: '4px 16px', padding: '8px 12px', width: '100%',
      zIndex: '10', pointerEvents: 'none',
      fontFamily: FONT, color: '#e0e8ff', fontSize: '14px',
      background: 'rgba(10,10,20,0.8)',
    });
    const left = document.createElement('span');
    left.style.color = '#ffc107';
    left.style.fontWeight = 'bold';
    const center = document.createElement('span');
    center.style.color = '#00d4ff';
    const right = document.createElement('span');
    right.style.color = '#aabbdd';
    right.style.textAlign = 'right';
    hud.append(left, center, right);
    const container = this.game.canvas.parentElement;
    if (container) {
      container.style.position = 'relative';
      container.appendChild(hud);
    }
    this.hudEl = hud;
    this.hudLeft = left;
    this.hudCenter = center;
    this.hudRight = right;
  }

  private destroyHUD() {
    if (this.hudEl) {
      this.hudEl.remove();
      this.hudEl = null;
      this.hudLeft = null;
      this.hudCenter = null;
      this.hudRight = null;
    }
  }

  private updateUI() {
    const me = this.me();
    if (!me) return;

    if (this.hudLeft) this.hudLeft.textContent = `❤️ ${me.hp}   💰 ${me.gold}   ⚡ ${me.pvpPoints || 0}`;
    this.updatePhaseText();

    // Shop slots (DOM)
    const shopUpgradeSlots = this.getShopUpgradeSlots(me);

    for (let i = 0; i < 5; i++) {
      const slot = this.domShopSlots[i];
      if (!slot) continue;
      const defId = me.shop[i];
      const isSelected = this.selectedShopIndex === i;
      const enablesUpgrade = shopUpgradeSlots.has(i);

      if (defId) {
        const def = TOWER_MAP[defId];
        if (def) {
          const color = SHOP_TOWER_COLORS[def.towerType] || '#888';
          const textColor = isSelected ? '#ffc107' : color;
          const bgColor = isSelected ? 'rgba(42,42,10,0.9)' : enablesUpgrade ? 'rgba(26,42,26,0.9)' : 'rgba(13,17,23,0.9)';
          slot.innerHTML = `<span style="color:${color}">■</span> ${def.name}<br><span style="color:#ffc107">${def.cost}g</span>`;
          slot.style.color = textColor;
          slot.style.background = bgColor;
          slot.style.borderColor = enablesUpgrade ? '#44ff44' : isSelected ? '#ffc107' : 'rgba(0,212,255,0.3)';
        }
      } else {
        slot.innerHTML = '<span style="color:#444">— empty —</span>';
        slot.style.color = '#444';
        slot.style.background = 'rgba(13,17,23,0.9)';
        slot.style.borderColor = 'rgba(0,212,255,0.3)';
      }
    }

    // Augment list (DOM)
    if (this.domAugmentList) {
      let html = '';
      if (me.activeCombo) {
        const combo = COMBO_MAP[me.activeCombo];
        if (combo) {
          html += `<div style="color:${combo.color};font-weight:700">${combo.name.toUpperCase()}</div>`;
          html += `<div style="font-size:11px;color:#aaa">${combo.description}</div><br>`;
        }
      } else if (me.elements && me.elements.length > 0) {
        const activeElem = me.elements[me.elements.length - 1];
        const emoji = ELEMENT_EMOJI[activeElem as Element] || '';
        html += `<div style="font-weight:700">${emoji} ${activeElem.toUpperCase()}</div><br>`;
      }
      html += `<div style="font-weight:700;color:#00d4ff">AUGMENTS</div>`;
      if (me.augments.length > 0) {
        for (const augId of me.augments) {
          const aug = AUGMENT_POOL.find(a => a.id === augId);
          if (aug) html += `<div style="padding-left:4px">${aug.name}</div>`;
        }
      } else {
        html += '<div style="color:#666;padding-left:4px">(none yet)</div>';
      }
      this.domAugmentList.innerHTML = html;
    }

    // Opponents (DOM)
    const opponents = this.gameState.players.filter((p) => p.id !== this.myId);
    opponents.forEach((opp, i) => {
      if (i < this.domOpponents.length) {
        const status = opp.alive ? `❤️ ${opp.hp}` : '💀';
        const augCount = opp.augments?.length || 0;
        const pColor = PLAYER_COLOR_HEX[opp.color];
        this.domOpponents[i].innerHTML = `<span style="color:${pColor};font-weight:700">${opp.name}</span><br>${status}${augCount > 0 ? ` | ✨×${augCount}` : ''}`;
        this.domOpponents[i].style.display = '';
      }
    });
    for (let i = opponents.length; i < this.domOpponents.length; i++) {
      this.domOpponents[i].style.display = 'none';
    }

    // Update PvP panel
    this.updatePvPPanel();
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
    const streakText = streak > 0 ? `🔥×${streak}` : '';
    
    if (this.hudCenter) {
      this.hudCenter.textContent = `📍 Round ${this.gameState.round}/30  ${phase}  ${timer}`;
    }

    // Feature 2: Next wave info + streak in right section
    let rightText = '';
    if (streakText) rightText += streakText + '  ';
    if (this.nextWaveInfo && this.gameState.phase === 'shopping') {
      const typeIcons: Record<string, string> = {
        boss: '👑', tank: '🛡️', runner: '🏃', swarm: '🐛',
      };
      const icon = typeIcons[this.nextWaveInfo.mobType] || '👹';
      const elementText = this.nextWaveInfo.element ? 
        ` ${ELEMENT_EMOJI[this.nextWaveInfo.element] || '?'} ${this.nextWaveInfo.element}` : 
        (this.gameState.round >= 2 ? ' Random' : '');
      rightText += `Next: ${icon} ${this.nextWaveInfo.mobType} ×${this.nextWaveInfo.count} HP:${this.nextWaveInfo.hp}${elementText}`;
    }
    if (this.hudRight) this.hudRight.textContent = rightText;
  }

  // ── Actions ───────────────────────────────────────────

  private selectShopSlot(shopIndex: number) {
    
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
    const me = this.me();
    if (!me) return;

    // Feature 5: Click on existing tower = select and show action menu
    const existingTower = me.towers.find(t => t.position.row === pos.row && t.position.col === pos.col);
    if (existingTower) {
      this.selectedTowerId = existingTower.instanceId;
      this.showTowerActionMenu(existingTower.instanceId);
      this.selectedShopIndex = -1;
      this.selectedTowerDefId = null;
      this.updateUI();
      return;
    }

    // Click on empty cell - place tower if shop item selected, else deselect
    if (this.selectedShopIndex >= 0 && this.selectedTowerDefId) {
      if (isPathCell(this.mapDef, pos)) return;
      
      socket.send({ type: 'BUY_AND_PLACE', shopIndex: this.selectedShopIndex, position: pos });
      sfx.towerPlace();
      this.selectedShopIndex = -1;
      this.selectedTowerDefId = null;
      this.updateUI();
    } else {
      // Deselect everything
      this.selectedTowerId = null;
      this.hideTowerActionMenu();
      this.selectedShopIndex = -1;
      this.selectedTowerDefId = null;
      this.updateUI();
    }
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

  // ── Feature 5: Tower Action Menu ──────────────────────

  private showTowerActionMenu(towerId: string) {
    this.hideTowerActionMenu();
    
    const me = this.me();
    if (!me) return;
    
    const tower = me.towers.find(t => t.instanceId === towerId);
    if (!tower) return;
    
    const def = TOWER_MAP[tower.defId];
    if (!def) return;
    
    const x = GRID_X + tower.position.col * CELL + CELL / 2;
    const y = GRID_Y + tower.position.row * CELL + CELL / 2;
    
    this.towerActionMenu = this.add.container(0, 0).setDepth(20);
    
    const copies = tower.stars >= 3 ? 9 : tower.stars >= 2 ? 3 : 1;
    const sellPrice = Math.floor(def.cost * copies * 0.7);
    const canUpgrade = tower.canUpgrade;
    const canApplyElement = def.towerType !== 'pvp'; // all towers except Warp Gate
    
    // Collect unlocked combos
    const unlockedCombos: ElementCombo[] = [];
    if (me.elements.length >= 2) {
      for (let i = 0; i < me.elements.length; i++) {
        for (let j = i + 1; j < me.elements.length; j++) {
          const combo = findCombo(me.elements[i], me.elements[j]);
          if (combo && !unlockedCombos.find(c => c.id === combo.id)) {
            unlockedCombos.push(combo);
          }
        }
      }
    }
    // Unique elements the player has unlocked
    const uniqueElements = [...new Set(me.elements)];
    
    // Calculate panel size
    const elementRowCount = canApplyElement ? Math.ceil((uniqueElements.length + unlockedCombos.length) / 4) : 0;
    const panelW = 180;
    const panelH = 40 + (elementRowCount > 0 ? 10 + elementRowCount * 28 : 0);
    const panelX = Math.min(x + 70, GRID_X + GRID_PX - panelW / 2);
    const panelY = Math.max(y - panelH / 2, GRID_Y + panelH / 2);
    
    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0d1117, 0.95);
    panel.setStrokeStyle(2, 0x00d4ff, 0.8);
    this.towerActionMenu.add(panel);
    
    // Row 1: Sell + Upgrade
    const row1Y = panelY - panelH / 2 + 18;
    
    const sellBtn = this.add.text(panelX - panelW / 2 + 8, row1Y, `SELL ${sellPrice}g`, {
      fontFamily: FONT, fontSize: '11px', color: '#fff', backgroundColor: '#cc3333',
      padding: { x: 6, y: 4 }, fontStyle: 'bold',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        socket.send({ type: 'SELL_TOWER', instanceId: towerId });
        this.selectedTowerId = null;
        this.hideTowerActionMenu();
        this.updateUI();
      });
    this.towerActionMenu.add(sellBtn);
    
    const upColor = canUpgrade ? '#33aa33' : '#333344';
    const upTextColor = canUpgrade ? '#fff' : '#666';
    const upgradeBtn = this.add.text(panelX + 20, row1Y, '★ UP', {
      fontFamily: FONT, fontSize: '11px', color: upTextColor, backgroundColor: upColor,
      padding: { x: 6, y: 4 }, fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    if (canUpgrade) {
      upgradeBtn.setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          socket.send({ type: 'UPGRADE_TOWER', towerId });
          this.hideTowerActionMenu();
        });
    }
    this.towerActionMenu.add(upgradeBtn);
    
    // Element/Combo buttons (only for arrow/cannon)
    if (canApplyElement && uniqueElements.length > 0) {
      let btnIdx = 0;
      const elemStartY = row1Y + 22;
      const btnSize = 24;
      const btnGap = 4;
      const perRow = 4;
      const startX = panelX - panelW / 2 + 12;
      
      // Neutral button (remove element)
      const isNeutral = !tower.element && !tower.combo;
      const neutralBtn = this.add.rectangle(
        startX + btnIdx % perRow * (btnSize + btnGap) + btnSize / 2,
        elemStartY + Math.floor(btnIdx / perRow) * (btnSize + btnGap) + btnSize / 2,
        btnSize, btnSize, 0x444466, isNeutral ? 1 : 0.5
      ).setStrokeStyle(isNeutral ? 2 : 1, isNeutral ? 0xffffff : 0x666666)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          socket.send({ type: 'APPLY_ELEMENT', towerId });
        });
      this.towerActionMenu.add(neutralBtn);
      const neutralLabel = this.add.text(
        neutralBtn.x, neutralBtn.y, '✕', { fontFamily: FONT, fontSize: '12px', color: '#aaa' }
      ).setOrigin(0.5);
      this.towerActionMenu.add(neutralLabel);
      btnIdx++;
      
      // Element buttons
      for (const elem of uniqueElements) {
        const isActive = tower.element === elem && !tower.combo;
        const col = btnIdx % perRow;
        const row = Math.floor(btnIdx / perRow);
        const bx = startX + col * (btnSize + btnGap) + btnSize / 2;
        const by = elemStartY + row * (btnSize + btnGap) + btnSize / 2;
        const colorHex = ELEMENT_COLOR_HEX[elem] || 0xffffff;
        
        const btn = this.add.rectangle(bx, by, btnSize, btnSize, colorHex, isActive ? 1 : 0.6)
          .setStrokeStyle(isActive ? 2 : 1, isActive ? 0xffffff : colorHex)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            socket.send({ type: 'APPLY_ELEMENT', towerId, element: elem });
          });
        this.towerActionMenu.add(btn);
        
        const emoji = ELEMENT_EMOJI[elem] || '?';
        const label = this.add.text(bx, by, emoji, { fontFamily: FONT, fontSize: '11px' }).setOrigin(0.5);
        this.towerActionMenu.add(label);
        btnIdx++;
      }
      
      // Combo buttons
      for (const combo of unlockedCombos) {
        const isActive = tower.combo === combo.id;
        const col = btnIdx % perRow;
        const row = Math.floor(btnIdx / perRow);
        const bx = startX + col * (btnSize + btnGap) + btnSize / 2;
        const by = elemStartY + row * (btnSize + btnGap) + btnSize / 2;
        
        const btn = this.add.rectangle(bx, by, btnSize, btnSize, combo.colorHex, isActive ? 1 : 0.6)
          .setStrokeStyle(isActive ? 2 : 1, isActive ? 0xffffff : combo.colorHex)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            socket.send({ type: 'APPLY_ELEMENT', towerId, comboId: combo.id });
          });
        this.towerActionMenu.add(btn);
        
        const label = this.add.text(bx, by, combo.name.slice(0, 2), {
          fontFamily: FONT, fontSize: '8px', color: '#fff', fontStyle: 'bold',
        }).setOrigin(0.5);
        this.towerActionMenu.add(label);
        btnIdx++;
      }
    }
  }

  private hideTowerActionMenu() {
    if (this.towerActionMenu) {
      this.towerActionMenu.destroy();
      this.towerActionMenu = null;
    }
  }

  // ── Feature 4: PvP Panel ───────────────────────────────

  // PvP panel is now DOM-based, created in createDOMUI/buildPvPPanelDOM

  private queuePvPUnit(unitType: string) {
    const opponents = this.gameState.players.filter(p => p.id !== this.myId && p.alive);
    if (opponents.length === 0) return;
    
    const target = opponents[this.pvpTargetIndex % opponents.length];
    socket.send({ type: 'QUEUE_PVP_UNIT', unitType, targetPlayerId: target.id });
  }

  private cycleTarget() {
    const opponents = this.gameState.players.filter(p => p.id !== this.myId && p.alive);
    if (opponents.length === 0) return;
    
    this.pvpTargetIndex = (this.pvpTargetIndex + 1) % opponents.length;
    this.updatePvPPanel();
  }

  private updatePvPPanel() {
    if (!this.domPvPPanel) return;
    
    const me = this.me();
    const pts = me?.pvpPoints || 0;
    const pointsDisplay = (this.domPvPPanel as any)._pointsDisplay as HTMLDivElement | undefined;
    if (pointsDisplay) pointsDisplay.textContent = `⚡ ${pts} pts`;

    // Grey out buttons player can't afford
    const costs = [3, 8, 10];
    costs.forEach((cost, i) => {
      const btn = (this.domPvPPanel as any)[`_pvpBtn${i}`] as HTMLDivElement | undefined;
      if (btn) {
        btn.style.opacity = pts >= cost ? '1' : '0.4';
        btn.style.pointerEvents = pts >= cost ? 'auto' : 'none';
      }
    });

    const targetBtn = (this.domPvPPanel as any)._targetBtn as HTMLSpanElement | undefined;
    const queueLabel = (this.domPvPPanel as any)._queueLabel as HTMLDivElement | undefined;
    if (!targetBtn || !queueLabel) return;
    
    const opponents = this.gameState.players.filter(p => p.id !== this.myId && p.alive);
    if (opponents.length > 0) {
      const target = opponents[this.pvpTargetIndex % opponents.length];
      targetBtn.textContent = target.name;
      targetBtn.style.color = PLAYER_COLOR_HEX[target.color];
    } else {
      targetBtn.textContent = 'No targets';
      targetBtn.style.color = '#666';
    }
    
    if (this.pvpQueue.length === 0) {
      queueLabel.textContent = 'Queue: (empty)';
    } else {
      const queueText = this.pvpQueue.map(entry => {
        const unitName = entry.unitType.replace('pvp_', '');
        const targetPlayer = this.gameState.players.find(p => p.id === entry.targetPlayerId);
        return `${unitName} → ${targetPlayer?.name || '?'}`;
      }).join(', ');
      queueLabel.textContent = `Queue: ${queueText}`;
    }
  }

  private showUpgradeAnimation(x: number, y: number, tier: TowerTier) {
    const label = tier >= 3 ? '★★★ T3!' : '★★ T2!';
    const color = tier >= 3 ? '#ff4488' : '#ffd93d';
    
    // Flash
    const flash = this.add.circle(x, y, 30, Phaser.Display.Color.HexStringToColor(color).color, 0.6)
      .setDepth(20);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 2, scaleY: 2,
      duration: 400,
      onComplete: () => flash.destroy(),
    });

    // Text
    const text = this.add.text(x, y - 25, label, {
      fontFamily: FONT, fontSize: '18px', color, fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(25);
    this.tweens.add({
      targets: text,
      alpha: 0, y: y - 60,
      duration: 1000,
      onComplete: () => text.destroy(),
    });
  }

  // ── Shop Upgrade Detection ────────────────────────────

  /** Get shop slot indices that enable an upgrade for any placed tower */
  private getShopUpgradeSlots(me: PlayerState): Set<number> {
    const result = new Set<number>();
    // For each tower type on field at T1, check if shop has 2+ of that type
    const t1Types = new Set(me.towers.filter(t => t.stars === 1).map(t => t.defId));
    
    for (const defId of t1Types) {
      const shopIndices: number[] = [];
      for (let i = 0; i < me.shop.length; i++) {
        if (me.shop[i] === defId) shopIndices.push(i);
      }
      if (shopIndices.length >= 2) {
        for (const idx of shopIndices) result.add(idx);
      }
    }
    return result;
  }

  // ── Combo Animations ──────────────────────────────────

  private showComboUnlockAnimation(comboName: string, comboColor: string) {
    const cx = GRID_X + GRID_PX / 2;
    const cy = GRID_Y + GRID_PX / 2;
    
    const text = this.add.text(cx, cy, `${comboName.toUpperCase()} UNLOCKED!`, {
      fontFamily: FONT, fontSize: '32px', color: comboColor, fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(25).setAlpha(0);

    this.tweens.add({
      targets: text,
      alpha: 1,
      scaleX: { from: 0.5, to: 1.2 },
      scaleY: { from: 0.5, to: 1.2 },
      duration: 400,
      yoyo: true,
      hold: 800,
      onComplete: () => text.destroy(),
    });
  }

  // ── Tech Tree Overlay (Feature 3) ─────────────────────

  private techTreeDOM: HTMLDivElement | null = null;

  private showTechTree() {
    if (this.techTreeVisible) { this.hideTechTree(); return; }
    this.techTreeVisible = true;

    const me = this.me();
    const myElements = me?.elements || [];

    // Find unlocked combos
    const unlockedCombos = new Set<string>();
    for (let i = 0; i < myElements.length; i++) {
      for (let j = i + 1; j < myElements.length; j++) {
        const combo = findCombo(myElements[i], myElements[j]);
        if (combo) unlockedCombos.add(combo.id);
      }
    }

    // Build DOM overlay
    const container = document.getElementById('game-container');
    if (!container) return;

    const overlay = document.createElement('div');
    overlay.id = 'tech-tree-overlay';
    Object.assign(overlay.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.92)', zIndex: '50',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: "'Chakra Petch', system-ui, sans-serif", color: '#e0e8ff',
      overflow: 'auto', padding: '20px 10px',
    });
    container.appendChild(overlay);
    this.techTreeDOM = overlay;

    // Title bar
    const titleBar = document.createElement('div');
    Object.assign(titleBar.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      width: '100%', maxWidth: '800px', marginBottom: '16px',
    });
    const title = document.createElement('div');
    title.textContent = 'ELEMENT COMBO TECH TREE';
    Object.assign(title.style, { fontSize: '20px', fontWeight: 'bold', color: '#FFD93D' });
    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      fontSize: '22px', color: '#ff4444', cursor: 'pointer', padding: '4px 8px',
    });
    closeBtn.onclick = () => this.hideTechTree();
    titleBar.appendChild(title);
    titleBar.appendChild(closeBtn);
    overlay.appendChild(titleBar);

    // Element row (top level of tree)
    const elemRow = document.createElement('div');
    Object.assign(elemRow.style, {
      display: 'flex', justifyContent: 'center', gap: '12px',
      marginBottom: '8px', flexWrap: 'wrap',
    });
    overlay.appendChild(elemRow);

    const elemPositions: Record<string, number> = {};
    ALL_ELEMENTS.forEach((elem, i) => {
      elemPositions[elem] = i;
      const unlocked = myElements.includes(elem);
      const node = document.createElement('div');
      Object.assign(node.style, {
        width: '80px', textAlign: 'center', padding: '8px 4px',
        borderRadius: '8px', border: `2px solid ${unlocked ? ELEMENT_COLOR[elem] : '#333'}`,
        background: unlocked ? 'rgba(255,255,255,0.08)' : 'rgba(30,30,40,0.8)',
        opacity: unlocked ? '1' : '0.4',
        transition: 'all 0.2s',
      });
      node.innerHTML = `<div style="font-size:24px">${ELEMENT_EMOJI[elem]}</div>
        <div style="font-size:11px;font-weight:bold;color:${ELEMENT_COLOR[elem]};margin-top:2px">${elem.toUpperCase()}</div>`;
      elemRow.appendChild(node);
    });

    // Connector lines section + combo rows
    // Group combos by "tier" (distance between parent elements)
    const tiers: Record<number, typeof COMBO_DEFS> = {};
    COMBO_DEFS.forEach(combo => {
      const i1 = elemPositions[combo.elements[0]] ?? 0;
      const i2 = elemPositions[combo.elements[1]] ?? 0;
      const span = Math.abs(i2 - i1);
      if (!tiers[span]) tiers[span] = [];
      tiers[span].push(combo);
    });

    // SVG for connector lines
    const svgNS = 'http://www.w3.org/2000/svg';
    const treeArea = document.createElement('div');
    Object.assign(treeArea.style, {
      position: 'relative', width: '100%', maxWidth: '800px',
    });
    overlay.appendChild(treeArea);

    // Render combo tiers
    const sortedSpans = Object.keys(tiers).map(Number).sort((a, b) => a - b);
    sortedSpans.forEach(span => {
      const tierCombos = tiers[span];

      // Row label
      const rowLabel = document.createElement('div');
      rowLabel.textContent = span === 1 ? '── Adjacent Combos ──' : span === 2 ? '── Near Combos ──' : `── Distant Combos (${span}) ──`;
      Object.assign(rowLabel.style, {
        textAlign: 'center', color: '#555', fontSize: '10px',
        margin: '12px 0 6px', letterSpacing: '2px',
      });
      treeArea.appendChild(rowLabel);

      // Combo cards row
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', justifyContent: 'center', gap: '8px',
        flexWrap: 'wrap', marginBottom: '4px',
      });
      treeArea.appendChild(row);

      tierCombos.forEach(combo => {
        const hasE1 = myElements.includes(combo.elements[0]);
        const hasE2 = myElements.includes(combo.elements[1]);
        const unlocked = hasE1 && hasE2;
        const partial = hasE1 || hasE2;

        const card = document.createElement('div');
        Object.assign(card.style, {
          width: '105px', padding: '8px', borderRadius: '8px',
          border: `2px solid ${unlocked ? combo.color : partial ? combo.color + '66' : '#222'}`,
          background: unlocked ? combo.color + '22' : 'rgba(20,20,30,0.9)',
          opacity: unlocked ? '1' : partial ? '0.7' : '0.35',
          cursor: 'default', transition: 'all 0.2s', position: 'relative',
        });

        const e1emoji = ELEMENT_EMOJI[combo.elements[0]] || '?';
        const e2emoji = ELEMENT_EMOJI[combo.elements[1]] || '?';

        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:16px">${e1emoji}</span>
            <span style="font-size:10px;color:#666">+</span>
            <span style="font-size:16px">${e2emoji}</span>
          </div>
          <div style="font-size:12px;font-weight:bold;color:${combo.color}">${combo.name}</div>
          <div style="font-size:10px;color:#999;margin-top:3px;line-height:1.3">${combo.description}</div>
          ${unlocked ? '<div style="position:absolute;top:4px;right:6px;font-size:10px;color:#4f4">✓</div>' : ''}
        `;
        row.appendChild(card);
      });
    });

    // Legend
    const legend = document.createElement('div');
    Object.assign(legend.style, {
      display: 'flex', gap: '16px', justifyContent: 'center',
      marginTop: '16px', fontSize: '11px', color: '#666',
    });
    legend.innerHTML = `
      <span>🟢 Unlocked</span>
      <span>🟡 Partially unlocked</span>
      <span>⚫ Locked</span>
    `;
    treeArea.appendChild(legend);
  }

  private hideTechTree() {
    this.techTreeVisible = false;
    if (this.techTreeDOM) {
      this.techTreeDOM.remove();
      this.techTreeDOM = null;
    }
    // Also clean up old Phaser overlay if exists
    if (this.techTreeOverlay) {
      this.techTreeOverlay.destroy();
      this.techTreeOverlay = null;
    }
  }

  private me(): PlayerState | undefined {
    return this.gameState.players.find((p) => p.id === this.myId);
  }
}
