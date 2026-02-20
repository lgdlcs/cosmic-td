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
  ELEMENT_COLORS,
  ELEMENT_SYMBOLS,
  TOWER_MAP,
  PLAYER_COLOR_HEX,
  isPathCell,
} from '@ect/shared';

// ── Procedural Sound Effects (Web Audio API) ───────────

class SoundFX {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext | null {
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch { return null; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.15) {
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
    const freqs: Record<string, number> = { fire: 300, water: 500, earth: 150, wind: 700, light: 900, dark: 200 };
    const types: Record<string, OscillatorType> = { fire: 'sawtooth', water: 'sine', earth: 'square', wind: 'triangle', light: 'sine', dark: 'sawtooth' };
    this.tone(freqs[element] || 400, 0.08, types[element] || 'square', 0.08);
  }

  mobDeath() { this.tone(200, 0.1, 'square', 0.12); this.tone(100, 0.15, 'sawtooth', 0.1); }
  
  waveStart() { this.tone(440, 0.15, 'square', 0.15); setTimeout(() => this.tone(660, 0.2, 'square', 0.15), 150); }
  
  goldReceived() { this.tone(1200, 0.06, 'sine', 0.1); setTimeout(() => this.tone(1600, 0.06, 'sine', 0.1), 60); }
  
  leak() { this.tone(150, 0.3, 'sawtooth', 0.2); }
}

const sfx = new SoundFX();

const CELL = 64;
const GRID_X = 210;
const GRID_Y = 50;
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
}

interface LeakEffect {
  x: number; y: number;
  alpha: number;
}

interface ShopFlashEffect {
  slotIndex: number;
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
  private towerGfx!: Phaser.GameObjects.Graphics;
  private mobGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;

  // Visual effects
  private projectiles: Projectile[] = [];
  private deathEffects: DeathEffect[] = [];
  private damageTexts: DamageText[] = [];
  private leakEffects: LeakEffect[] = [];
  private shopFlashEffects: ShopFlashEffect[] = [];

  // Tower flash (instanceId → remaining ms)
  private towerFlash: Map<string, number> = new Map();

  // Shop interaction state (no more bench)
  private selectedShopIndex: number = -1; // -1 = none selected, 0+ = shop index
  private selectedTowerDefId: string | null = null; // defId of selected tower for preview
  private gridHover: GridHover | null = null;
  private hoveredTower: string | null = null; // instanceId of hovered tower

  // Opponent mini-view graphics
  private miniGfx!: Phaser.GameObjects.Graphics;

  // UI
  private uiTopLeft!: Phaser.GameObjects.Text;
  private uiTopRight!: Phaser.GameObjects.Text;
  private uiShopSlots: Phaser.GameObjects.Text[] = [];
  private uiSynergy!: Phaser.GameObjects.Text;
  private uiOpponents: Phaser.GameObjects.Text[] = [];
  private uiHex!: Phaser.GameObjects.Text;
  private uiMobCount!: Phaser.GameObjects.Text;
  private uiTowerHoverInfo!: Phaser.GameObjects.Text;

  // Timer
  private localTimer = 0;
  private timerEvent: Phaser.Time.TimerEvent | null = null;

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
    this.towerGfx = this.add.graphics().setDepth(1);
    this.mobGfx = this.add.graphics().setDepth(2);
    this.fxGfx = this.add.graphics().setDepth(3);
    this.miniGfx = this.add.graphics().setDepth(4);

    this.projectiles = [];
    this.deathEffects = [];
    this.damageTexts = [];
    this.leakEffects = [];
    this.shopFlashEffects = [];
    this.towerFlash.clear();
    this.selectedShopIndex = -1;
    this.selectedTowerDefId = null;
    this.gridHover = null;
    this.hoveredTower = null;

    this.drawGrid();
    this.createUI();

    // Grid click and hover
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
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

    // Right click to deselect
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.rightButtonDown()) {
        this.selectedShopIndex = -1;
        this.selectedTowerDefId = null;
        this.updateUI();
      }
    });

    // ESC to deselect
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
  }

  update(_time: number, delta: number) {
    this.updateProjectiles(delta);
    this.updateDeathEffects(delta);
    this.updateDamageTexts(delta);
    this.updateLeakEffects(delta);
    this.updateTowerFlash(delta);
    this.updateShopFlashEffects(delta);

    this.drawTowers();
    this.drawMobs();
    this.drawGridPreview();
    this.drawFX();
    this.drawOpponentMiniViews();

    // Update mob count during combat
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
        // Phase announcement flash
        if (msg.phase === 'combat') {
          this.showPhaseFlash('⚔️ COMBAT');
          sfx.waveStart();
        } else if (msg.phase === 'shopping') {
          this.showPhaseFlash(`🛒 ROUND ${msg.round}`);
        }
        break;

      case 'SHOP_UPDATE': {
        const me = this.me();
        if (me) {
          // Check for shop slot changes to trigger flash effect
          const oldShop = me.shop.slice();
          me.shop = msg.shop;
          me.gold = msg.gold;
          
          // Find slots that became empty (purchased)
          for (let i = 0; i < 5; i++) {
            if (oldShop[i] && !msg.shop[i]) {
              this.triggerShopFlash(i);
            }
          }
          
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

      case 'GAME_OVER':
        socket.clearHandlers();
        this.scene.start('GameOverScene', {
          winnerId: msg.winnerId,
          players: this.gameState.players,
        });
        break;
    }
  }

  // ── Combat Events → Visual Effects ────────────────────

  private onCombatEvents(attacks: CombatAttack[], kills: string[], leaks: string[]) {
    // Play shoot sounds (throttled — max 3 per batch)
    for (const atk of attacks.slice(0, 3)) {
      sfx.towerShoot(atk.element);
    }

    // Spawn projectiles
    for (const atk of attacks) {
      const sx = GRID_X + atk.towerX * CELL + CELL / 2;
      const sy = GRID_Y + atk.towerY * CELL + CELL / 2;
      const tx = GRID_X + atk.targetX * CELL + CELL / 2;
      const ty = GRID_Y + atk.targetY * CELL + CELL / 2;
      const color = Phaser.Display.Color.HexStringToColor(
        ELEMENT_COLORS[atk.element as keyof typeof ELEMENT_COLORS] || '#fff'
      ).color;

      this.projectiles.push({
        x: sx, y: sy, tx, ty,
        color,
        speed: 600, // pixels per second
        alive: true,
        splash: atk.splash,
      });

      // Damage number at target
      this.damageTexts.push({
        x: tx + (Math.random() - 0.5) * 20,
        y: ty - 10,
        text: `-${Math.round(atk.damage)}`,
        alpha: 1,
        vy: -40,
      });

      // Tower flash
      // (we don't have towerId mapped to position here, so flash is implicit via projectile origin)
    }

    // Death effects + sounds for killed mobs
    if (kills.length > 0) sfx.mobDeath();
    if (kills.length > 0) sfx.goldReceived();
    for (const mobId of kills) {
      const mob = (this.gameState.mobs[this.myId] || []).find((m) => m.instanceId === mobId);
      if (mob) {
        const mx = GRID_X + mob.x * CELL + CELL / 2;
        const my = GRID_Y + mob.y * CELL + CELL / 2;
        this.deathEffects.push({
          x: mx, y: my, radius: 8, alpha: 1, color: 0xFFD93D,
        });
        // Gold pop text (dynamic reward based on round)
        const round = this.gameState.round;
        let goldReward = 1;
        if (round <= 10) goldReward = 1;
        else if (round <= 20) goldReward = 2;
        else goldReward = 3;
        
        this.damageTexts.push({
          x: mx, y: my - 15,
          text: `+${goldReward}g`,
          alpha: 1,
          vy: -30,
        });
      }
    }

    // Leak effects
    if (leaks.length > 0) sfx.leak();
    for (const mobId of leaks) {
      const exit = this.mapDef.exit;
      const ex = GRID_X + exit.col * CELL + CELL / 2;
      const ey = GRID_Y + exit.row * CELL + CELL / 2;
      this.leakEffects.push({ x: ex, y: ey, alpha: 1 });
      this.damageTexts.push({
        x: ex, y: ey - 15,
        text: '💔 LEAK',
        alpha: 1,
        vy: -25,
      });
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
      if (dist < p.speed * dtSec) {
        p.alive = false;
      } else {
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

  private updateDamageTexts(dt: number) {
    const dtSec = dt / 1000;
    for (const t of this.damageTexts) {
      t.y += t.vy * dtSec;
      t.alpha -= 1.5 * dtSec;
    }
    this.damageTexts = this.damageTexts.filter((t) => t.alpha > 0);
  }

  private updateLeakEffects(dt: number) {
    const dtSec = dt / 1000;
    for (const l of this.leakEffects) {
      l.alpha -= 2 * dtSec;
    }
    this.leakEffects = this.leakEffects.filter((l) => l.alpha > 0);
  }

  private updateTowerFlash(dt: number) {
    for (const [id, remaining] of this.towerFlash) {
      const next = remaining - dt;
      if (next <= 0) this.towerFlash.delete(id);
      else this.towerFlash.set(id, next);
    }
  }

  private updateShopFlashEffects(dt: number) {
    const dtSec = dt / 1000;
    for (const flash of this.shopFlashEffects) {
      flash.alpha -= 2.5 * dtSec;
    }
    this.shopFlashEffects = this.shopFlashEffects.filter(f => f.alpha > 0);
  }

  private triggerShopFlash(slotIndex: number) {
    this.shopFlashEffects.push({ slotIndex, alpha: 1 });
  }

  private updateGridHover(ptr: Phaser.Input.Pointer) {
    if (this.gameState.phase !== 'shopping') {
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
      const valid = !isPath && !isOccupied;
      
      this.gridHover = { position, valid };
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
        if (def) {
          const elems = def.elements.map(e => ELEMENT_SYMBOLS[e]).join('');
          const starLabel = tower.starLevel > 0 ? ` ★${tower.starLevel}` : '';
          const sellPrice = Math.floor(def.cost * 0.7);
          const info = `${elems} ${def.name}${starLabel}  |  DMG: ${def.damage}  SPD: ${def.attackSpeed}  RNG: ${def.range}`;
          const sellInfo = this.gameState.phase === 'shopping' ? `  |  💰 Sell ${sellPrice}g` : '';
          this.uiTowerHoverInfo.setText(info + sellInfo);
        }
      } else {
        this.hoveredTower = null;
        this.uiTowerHoverInfo.setText('');
      }
    } else {
      this.hoveredTower = null;
      this.uiTowerHoverInfo.setText('');
    }
  }

  private drawGridPreview() {
    // Clear previous preview
    this.gridGfx.lineStyle(0, 0);
    
    if (this.gridHover && this.selectedShopIndex >= 0 && this.selectedTowerDefId) {
      const x = GRID_X + this.gridHover.position.col * CELL;
      const y = GRID_Y + this.gridHover.position.row * CELL;
      const cx = x + CELL / 2;
      const cy = y + CELL / 2;
      
      // Draw preview cell background
      if (this.gridHover.valid) {
        this.gridGfx.fillStyle(0x44ff44, 0.3);
        this.gridGfx.lineStyle(2, 0x44ff44, 0.8);
      } else {
        this.gridGfx.fillStyle(0xff4444, 0.3);
        this.gridGfx.lineStyle(2, 0xff4444, 0.8);
      }
      
      this.gridGfx.fillRect(x, y, CELL, CELL);
      this.gridGfx.strokeRect(x, y, CELL, CELL);
      
      // Draw tower preview
      const def = TOWER_MAP[this.selectedTowerDefId];
      if (def && this.gridHover.valid) {
        const elemColor = Phaser.Display.Color.HexStringToColor(
          ELEMENT_COLORS[def.elements[0] || 'fire']
        ).color;
        const size = 20;
        
        // Semi-transparent tower preview
        this.gridGfx.fillStyle(elemColor, 0.6);
        const elem = def.elements[0];
        
        // Draw tower shape based on element
        switch (elem) {
          case 'fire':
            this.gridGfx.fillTriangle(cx, cy - size, cx - size * 0.8, cy + size * 0.6, cx + size * 0.8, cy + size * 0.6);
            break;
          case 'water':
            this.gridGfx.fillTriangle(cx, cy + size, cx - size * 0.8, cy - size * 0.6, cx + size * 0.8, cy - size * 0.6);
            break;
          case 'earth':
            this.gridGfx.fillRect(cx - size * 0.7, cy - size * 0.7, size * 1.4, size * 1.4);
            break;
          case 'wind':
            this.gridGfx.fillTriangle(cx, cy - size, cx + size, cy, cx, cy + size);
            this.gridGfx.fillTriangle(cx, cy - size, cx - size, cy, cx, cy + size);
            break;
          case 'light':
            this.gridGfx.fillCircle(cx, cy, size * 0.8);
            break;
          case 'dark':
            this.gridGfx.fillCircle(cx, cy, size);
            break;
          default:
            this.gridGfx.fillCircle(cx, cy, size);
        }
        
        // Show range preview
        this.gridGfx.lineStyle(1, elemColor, 0.2);
        this.gridGfx.strokeCircle(cx, cy, def.range * CELL);
      }
    }

    // Highlight hovered tower for selling
    if (this.hoveredTower) {
      const me = this.me();
      const tower = me?.towers.find(t => t.instanceId === this.hoveredTower);
      if (tower) {
        const x = GRID_X + tower.position.col * CELL;
        const y = GRID_Y + tower.position.row * CELL;
        this.gridGfx.lineStyle(2, 0xffd93d, 0.6);
        this.gridGfx.strokeRect(x, y, CELL, CELL);
      }
    }
  }

  // ── Draw FX Layer ─────────────────────────────────────

  private drawFX() {
    this.fxGfx.clear();

    // Projectiles
    for (const p of this.projectiles) {
      this.fxGfx.fillStyle(p.color, 0.9);
      this.fxGfx.fillCircle(p.x, p.y, p.splash ? 5 : 3);
      // Trail
      this.fxGfx.fillStyle(p.color, 0.3);
      this.fxGfx.fillCircle(p.x - (p.tx - p.x) * 0.02, p.y - (p.ty - p.y) * 0.02, 2);
    }

    // Death explosions
    for (const d of this.deathEffects) {
      this.fxGfx.lineStyle(2, d.color, d.alpha);
      this.fxGfx.strokeCircle(d.x, d.y, d.radius);
      // Inner burst
      this.fxGfx.fillStyle(d.color, d.alpha * 0.3);
      this.fxGfx.fillCircle(d.x, d.y, d.radius * 0.5);
    }

    // Leak flashes
    for (const l of this.leakEffects) {
      this.fxGfx.fillStyle(0xff0000, l.alpha * 0.4);
      this.fxGfx.fillCircle(l.x, l.y, 30);
    }

    // Shop flash effects
    for (const flash of this.shopFlashEffects) {
      const slot = this.uiShopSlots[flash.slotIndex];
      if (slot) {
        const bounds = slot.getBounds();
        this.fxGfx.fillStyle(0xffd93d, flash.alpha * 0.3);
        this.fxGfx.fillRect(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8);
        this.fxGfx.lineStyle(2, 0xffd93d, flash.alpha);
        this.fxGfx.strokeRect(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8);
      }
    }
  }

  // ── Grid (static, drawn once) ─────────────────────────

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

    // Entry / Exit labels
    const entry = this.mapDef.entry;
    const exit = this.mapDef.exit;
    this.add.text(GRID_X + entry.col * CELL + 8, GRID_Y + entry.row * CELL + 22, '▶ IN', {
      fontSize: '12px', color: '#4AD97A', fontStyle: 'bold',
    }).setDepth(0);
    this.add.text(GRID_X + exit.col * CELL + 4, GRID_Y + exit.row * CELL + 22, '✕ EXIT', {
      fontSize: '11px', color: '#D94A4A', fontStyle: 'bold',
    }).setDepth(0);
  }

  // ── Mobs (redrawn every frame) ────────────────────────

  private drawMobs() {
    this.mobGfx.clear();
    const myMobs = this.gameState.mobs[this.myId] || [];

    for (const mob of myMobs) {
      const x = GRID_X + mob.x * CELL + CELL / 2;
      const y = GRID_Y + mob.y * CELL + CELL / 2;
      const hpRatio = Math.max(0, mob.hp / mob.maxHp);
      const alpha = mob.visible ? 1 : 0.2;

      // Size and appearance by mob type
      let radius = 10;
      let borderColor = 0xffffff;
      let shape: 'circle' | 'square' | 'triangle' | 'diamond' = 'circle';

      if (mob.defId === 'boss') {
        radius = 18;
        borderColor = 0xffd93d;
      } else if (mob.defId === 'tank') {
        radius = 14;
        borderColor = 0xff6666;
        shape = 'square';
      } else if (mob.defId === 'runner') {
        radius = 8;
        borderColor = 0x66ff66;
        shape = 'diamond';
      } else if (mob.defId === 'swarm') {
        radius = 6;
        borderColor = 0x66ccff;
        shape = 'triangle';
      }

      // Body color: green→yellow→red based on HP
      const r = Math.floor(255 * (1 - hpRatio));
      const gr = Math.floor(200 * hpRatio + 55);
      const bodyColor = Phaser.Display.Color.GetColor(r, gr, 50);

      // Shadow
      this.mobGfx.fillStyle(0x000000, alpha * 0.3);
      this.mobGfx.fillEllipse(x + 2, y + radius + 2, radius * 1.6, radius * 0.5);

      // Body shape
      this.mobGfx.fillStyle(bodyColor, alpha);
      if (shape === 'square') {
        this.mobGfx.fillRect(x - radius * 0.7, y - radius * 0.7, radius * 1.4, radius * 1.4);
      } else if (shape === 'triangle') {
        this.mobGfx.fillTriangle(x, y - radius, x - radius * 0.8, y + radius * 0.6, x + radius * 0.8, y + radius * 0.6);
      } else if (shape === 'diamond') {
        this.mobGfx.fillTriangle(x, y - radius, x + radius, y, x, y + radius);
        this.mobGfx.fillTriangle(x, y - radius, x - radius, y, x, y + radius);
      } else {
        this.mobGfx.fillCircle(x, y, radius);
      }

      // Border
      this.mobGfx.lineStyle(1.5, borderColor, alpha * 0.8);
      if (shape === 'square') {
        this.mobGfx.strokeRect(x - radius * 0.7, y - radius * 0.7, radius * 1.4, radius * 1.4);
      } else if (shape === 'triangle') {
        this.mobGfx.strokeTriangle(x, y - radius, x - radius * 0.8, y + radius * 0.6, x + radius * 0.8, y + radius * 0.6);
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

      // Effect indicators
      let effectY = y + radius + 6;
      for (const eff of mob.effects) {
        if (eff.type === 'slow' && eff.value > 0) {
          this.mobGfx.fillStyle(0x4EA8DE, 0.7);
          this.mobGfx.fillCircle(x - 4, effectY, 3);
        }
        if (eff.type === 'poison') {
          this.mobGfx.fillStyle(0x9B5DE5, 0.7);
          this.mobGfx.fillCircle(x + 4, effectY, 3);
        }
        if (eff.type === 'burn') {
          this.mobGfx.fillStyle(0xFF6B35, 0.7);
          this.mobGfx.fillCircle(x, effectY, 3);
        }
      }
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

      const size = 20;

      // Range circle — prominent when hovered, subtle otherwise
      const isHovered = this.hoveredTower === tower.instanceId;
      if (isHovered) {
        this.towerGfx.fillStyle(elemColor, 0.08);
        this.towerGfx.fillCircle(cx, cy, def.range * CELL);
        this.towerGfx.lineStyle(2, elemColor, 0.5);
        this.towerGfx.strokeCircle(cx, cy, def.range * CELL);
      } else {
        this.towerGfx.lineStyle(1, elemColor, 0.08);
        this.towerGfx.strokeCircle(cx, cy, def.range * CELL);
      }

      // Base platform
      this.towerGfx.fillStyle(0x111122, 0.6);
      this.towerGfx.fillCircle(cx, cy + 4, size + 2);

      // Tower shape by element
      this.towerGfx.fillStyle(elemColor, 0.9);
      const elem = tower.elements[0];
      switch (elem) {
        case 'fire':
          // Triangle (pointing up)
          this.towerGfx.fillTriangle(cx, cy - size, cx - size * 0.8, cy + size * 0.6, cx + size * 0.8, cy + size * 0.6);
          break;
        case 'water':
          // Inverted triangle
          this.towerGfx.fillTriangle(cx, cy + size, cx - size * 0.8, cy - size * 0.6, cx + size * 0.8, cy - size * 0.6);
          break;
        case 'earth':
          // Square
          this.towerGfx.fillRect(cx - size * 0.7, cy - size * 0.7, size * 1.4, size * 1.4);
          break;
        case 'wind':
          // Diamond
          this.towerGfx.fillTriangle(cx, cy - size, cx + size, cy, cx, cy + size);
          this.towerGfx.fillTriangle(cx, cy - size, cx - size, cy, cx, cy + size);
          break;
        case 'light':
          // Star-ish (circle with glow)
          this.towerGfx.fillCircle(cx, cy, size * 0.8);
          this.towerGfx.fillStyle(elemColor, 0.3);
          this.towerGfx.fillCircle(cx, cy, size * 1.2);
          break;
        case 'dark':
          // Hexagon-ish
          this.towerGfx.fillCircle(cx, cy, size);
          this.towerGfx.fillStyle(0x1a1a2e, 0.5);
          this.towerGfx.fillCircle(cx, cy, size * 0.5);
          break;
        default:
          this.towerGfx.fillCircle(cx, cy, size);
      }

      // Star level indicator
      if (tower.starLevel > 0) {
        this.towerGfx.lineStyle(2, 0xFFD93D, 0.8);
        this.towerGfx.strokeCircle(cx, cy, size + 4);
        if (tower.starLevel >= 2) {
          this.towerGfx.lineStyle(1, 0xFFD93D, 0.5);
          this.towerGfx.strokeCircle(cx, cy, size + 7);
        }
      }

      // T2 indicator: second element dot
      if (tower.elements.length >= 2) {
        const secondColor = Phaser.Display.Color.HexStringToColor(
          ELEMENT_COLORS[tower.elements[1]]
        ).color;
        this.towerGfx.fillStyle(secondColor, 0.9);
        this.towerGfx.fillCircle(cx + size * 0.8, cy - size * 0.8, 5);
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

  // ── Phase Flash ───────────────────────────────────────

  private showPhaseFlash(text: string) {
    const cx = GRID_X + GRID_PX / 2;
    const cy = GRID_Y + GRID_PX / 2;
    const flash = this.add.text(cx, cy, text, {
      fontSize: '40px',
      color: '#FFD93D',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
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

  // ── UI ────────────────────────────────────────────────

  private createUI() {
    const shopY = GRID_Y + GRID_PX + 12;

    // Top bar
    this.uiTopLeft = this.add.text(GRID_X, 10, '', {
      fontSize: '15px', color: '#FFD93D', fontStyle: 'bold',
    }).setDepth(5);

    this.uiTopRight = this.add.text(GRID_X + GRID_PX, 10, '', {
      fontSize: '15px', color: '#4EA8DE',
    }).setOrigin(1, 0).setDepth(5);

    // Mob count (during combat)
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

    this.uiHex = this.add.text(10, GRID_Y + 230, '', {
      fontSize: '12px', color: '#D94A4A',
      fixedWidth: 185, wordWrap: { width: 175 },
    }).setDepth(5);

    // Shop
    this.add.text(GRID_X, shopY - 2, 'SHOP', {
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

    this.add.text(btnX, shopY + 50, '⬆️ Level Up 4g', {
      fontSize: '13px', color: '#1a1a2e', backgroundColor: '#4EA8DE',
      padding: { x: 8, y: 8 },
    }).setDepth(5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => socket.send({ type: 'LEVEL_UP' }));

    // DEV: skip shop timer
    this.add.text(btnX, shopY + 86, '▶ SEND WAVE', {
      fontSize: '13px', color: '#1a1a2e', backgroundColor: '#D94A4A',
      padding: { x: 8, y: 8 },
    }).setDepth(5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => socket.send({ type: 'DEV_START_COMBAT' }));

    // Synergy
    this.uiSynergy = this.add.text(GRID_X, shopY + 62, '', {
      fontSize: '12px', color: '#aaa',
    }).setDepth(5);

    // Shop instruction text (no more bench)
    this.add.text(GRID_X, shopY + 80, 'Click shop slot to select → Click grid to place', {
      fontSize: '11px', color: '#666', fontStyle: 'bold',
    }).setDepth(5);

    // Tower hover info
    this.uiTowerHoverInfo = this.add.text(GRID_X + GRID_PX, GRID_Y + GRID_PX - 20, '', {
      fontSize: '12px', color: '#ffd93d',
    }).setOrigin(1, 0).setDepth(5);
  }

  private updateUI() {
    const me = this.me();
    if (!me) return;

    this.uiTopLeft.setText(`❤️ ${me.hp}   💰 ${me.gold}   Lv.${me.level} (${me.xp}/${me.xpToNext})`);
    this.updatePhaseText();

    // Shop
    for (let i = 0; i < 5; i++) {
      const defId = me.shop[i];
      const isSelected = this.selectedShopIndex === i;
      
      if (defId) {
        const def = TOWER_MAP[defId];
        if (def) {
          const elems = def.elements.map((e) => ELEMENT_SYMBOLS[e]).join('');
          this.uiShopSlots[i]
            .setText(`${elems} ${def.name}\n${def.cost}g T${def.tier}`)
            .setColor(isSelected ? '#ffd93d' : (ELEMENT_COLORS[def.elements[0]] || '#eee'))
            .setBackgroundColor(isSelected ? '#4a4a0a' : '#0f3460');
        }
      } else {
        this.uiShopSlots[i]
          .setText('  — empty —')
          .setColor('#444')
          .setBackgroundColor('#0f3460');
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
    const selectionStatus = this.selectedShopIndex >= 0 ? '— Click grid to place tower' : '';
    this.uiSynergy.setText(`Synergies: ${parts.join('  ') || 'none yet'}  ${selectionStatus}`);

    // Opponents
    const opponents = this.gameState.players.filter((p) => p.id !== this.myId);
    opponents.forEach((opp, i) => {
      if (i < this.uiOpponents.length) {
        const status = opp.alive ? `❤️ ${opp.hp}` : '💀';
        this.uiOpponents[i]
          .setText(`${opp.name}\n${status}  Lv.${opp.level}`)
          .setColor(PLAYER_COLOR_HEX[opp.color]);
      }
    });
    for (let i = opponents.length; i < this.uiOpponents.length; i++) {
      this.uiOpponents[i].setText('');
    }

    // Hex
    if (me.incomingHex) {
      this.uiHex.setText(`⚠️ HEX: ${me.incomingHex.hexId.toUpperCase()}`);
    } else {
      this.uiHex.setText('');
    }
  }

  private updatePhaseText() {
    const me = this.me();
    const streak = me?.streak || 0;
    const phase = this.gameState.phase === 'shopping' ? '🛒 SHOP' : '⚔️ COMBAT';
    const timer = this.localTimer > 0 ? `⏱ ${this.localTimer}s` : '';
    const streakText = streak > 0 ? `  🔥×${streak}` : '';
    this.uiTopRight.setText(`📍 Round ${this.gameState.round}/30  ${phase}  ${timer}${streakText}`);
  }

  // ── Actions ───────────────────────────────────────────

  private selectShopSlot(shopIndex: number) {
    if (this.gameState.phase !== 'shopping') return;
    const me = this.me();
    if (!me || !me.shop[shopIndex]) return;
    
    // Toggle selection
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

    // Check if clicking on a tower to sell it
    const existingTower = me.towers.find(t => t.position.row === pos.row && t.position.col === pos.col);
    if (existingTower) {
      socket.send({ type: 'SELL_TOWER', instanceId: existingTower.instanceId });
      return;
    }

    // Check if trying to place a tower from shop
    if (this.selectedShopIndex < 0 || !this.selectedTowerDefId) return;
    if (isPathCell(this.mapDef, pos)) return;
    
    socket.send({ 
      type: 'BUY_AND_PLACE', 
      shopIndex: this.selectedShopIndex, 
      position: pos 
    });
    sfx.towerPlace();
    
    // Deselect after placement attempt
    this.selectedShopIndex = -1;
    this.selectedTowerDefId = null;
    this.updateUI();
  }

  // ── Opponent Mini-View ─────────────────────────────────

  private drawOpponentMiniViews() {
    this.miniGfx.clear();
    const opponents = this.gameState.players.filter(p => p.id !== this.myId && p.alive);
    const miniCell = 6;
    const miniSize = miniCell * GRID_SIZE; // 48px

    opponents.forEach((opp, idx) => {
      const baseX = GRID_X + GRID_PX + 20;
      const baseY = GRID_Y + idx * (miniSize + 50);

      // Background
      this.miniGfx.fillStyle(0x0a0a1e, 0.8);
      this.miniGfx.fillRect(baseX - 2, baseY - 2, miniSize + 4, miniSize + 4);
      this.miniGfx.lineStyle(1, Phaser.Display.Color.HexStringToColor(PLAYER_COLOR_HEX[opp.color]).color, 0.6);
      this.miniGfx.strokeRect(baseX - 2, baseY - 2, miniSize + 4, miniSize + 4);

      // Draw path cells
      for (const cell of this.mapDef.path) {
        this.miniGfx.fillStyle(0x2a2a4a, 0.5);
        this.miniGfx.fillRect(baseX + cell.col * miniCell, baseY + cell.row * miniCell, miniCell, miniCell);
      }

      // Draw towers
      for (const tower of opp.towers) {
        const elemColor = Phaser.Display.Color.HexStringToColor(
          ELEMENT_COLORS[tower.elements[0] || 'fire']
        ).color;
        this.miniGfx.fillStyle(elemColor, 0.9);
        this.miniGfx.fillRect(
          baseX + tower.position.col * miniCell + 1,
          baseY + tower.position.row * miniCell + 1,
          miniCell - 2, miniCell - 2
        );
      }

      // Draw mobs as tiny dots
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
