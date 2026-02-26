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
  TowerInstance,
  BaseTowerInstance,
  ElementTowerInstance,
  TowerType,
  PvPUnitDef,
} from '@ect/shared';
import {
  GRID_SIZE,
  PLAYER_COLOR_HEX,
  isPathCell,
  BASE_TOWER_DEFS,
  BASE_TOWER_MAP,
  ELEMENT_TOWER_DEFS,
  ELEMENT_TOWER_MAP,
  getBaseTowerStats,
  getElementTowerStats,
  getTowerDisplayColor,
  getTowerSellPrice,
  getElementUpgradeCreditCost,
  ELEMENT_EMOJI,
  ELEMENT_COLOR,
  ELEMENT_COLOR_HEX,
  getEffectiveness,
  COMBO_DEFS,
  COMBO_MAP,
  findCombo,
  ALL_ELEMENTS,
  PVP_UNIT_DEFS,
  PVP_UNIT_MAP,
  SELL_REFUND_RATIO,
  ELEMENT_CREDIT_VALUE,
} from '@ect/shared';
import type { Element } from '@ect/shared';

// ── Procedural Sound Effects ────────────────────────────

class SoundFX {
  private ctx: AudioContext | null = null;
  muted: boolean = true;
  toggle(): boolean { this.muted = !this.muted; localStorage.setItem('ect_muted', this.muted ? '1' : '0'); return this.muted; }
  constructor() { const s = localStorage.getItem('ect_muted'); this.muted = s === null ? true : s === '1'; }
  private getCtx(): AudioContext | null {
    if (!this.ctx) { try { this.ctx = new AudioContext(); } catch { return null; } }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.15) {
    if (this.muted) return;
    const c = this.getCtx(); if (!c) return;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
  }
  towerPlace() { this.tone(120, 0.15, 'triangle', 0.2); }
  towerShoot(el: string) { this.tone(el === 'railgun' ? 150 : 500, 0.08, 'square', 0.08); }
  mobDeath() { this.tone(200, 0.1, 'square', 0.12); }
  waveStart() { this.tone(440, 0.15, 'square', 0.15); setTimeout(() => this.tone(660, 0.2, 'square', 0.15), 150); }
  goldReceived() { this.tone(1200, 0.06, 'sine', 0.1); setTimeout(() => this.tone(1600, 0.06, 'sine', 0.1), 60); }
  leak() { this.tone(150, 0.3, 'sawtooth', 0.2); }
  bossSelect() { this.tone(300, 0.3, 'sawtooth', 0.2); setTimeout(() => this.tone(600, 0.4, 'sine', 0.15), 300); }
}

const sfx = new SoundFX();
const FONT = "'Chakra Petch', 'Segoe UI', system-ui, sans-serif";
const CELL = 36;
const GRID_X = 300;
const GRID_Y = 60;
const GRID_PX = CELL * GRID_SIZE;

// ── Visual effect structs ───────────────────────────────

interface Projectile { x: number; y: number; tx: number; ty: number; color: number; speed: number; alive: boolean; splash: boolean; }
interface DeathEffect { x: number; y: number; radius: number; alpha: number; color: number; }
interface DamageText { x: number; y: number; text: string; alpha: number; vy: number; obj?: Phaser.GameObjects.Text; }
interface LeakEffect { x: number; y: number; alpha: number; }

// ═══════════════════════════════════════════════════════

export class GameScene extends Phaser.Scene {
  private gameState!: GameState;
  private mapDef!: GameMap;
  private myId: string = '';

  private gridGfx!: Phaser.GameObjects.Graphics;
  private previewGfx!: Phaser.GameObjects.Graphics;
  private towerGfx!: Phaser.GameObjects.Graphics;
  private mobGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private miniGfx!: Phaser.GameObjects.Graphics;

  private projectiles: Projectile[] = [];
  private deathEffects: DeathEffect[] = [];
  private damageTexts: DamageText[] = [];
  private leakEffects: LeakEffect[] = [];

  // Placement state
  private placingTowerType: TowerType | null = null;
  private placingElements: Element[] | null = null;
  private gridHover: { position: GridPos; valid: boolean } | null = null;

  // Tower selection
  private selectedTowerId: string | null = null;
  private towerActionMenu: Phaser.GameObjects.Container | null = null;

  // Boss select overlay
  private bossSelectOverlay: Phaser.GameObjects.Container | null = null;

  // Tech tree overlay
  private techTreeDOM: HTMLDivElement | null = null;
  private techTreeVisible = false;

  // Next wave info
  private nextWaveInfo: { mobType: string; element?: Element; count: number; hp: number } | null = null;

  // UI
  private hudEl: HTMLDivElement | null = null;
  private hudLeft: HTMLSpanElement | null = null;
  private hudCenter: HTMLSpanElement | null = null;
  private hudRight: HTMLSpanElement | null = null;
  private uiTowerHoverInfo!: Phaser.GameObjects.Text;
  private gameUiEl: HTMLDivElement | null = null;
  private domSpeedBtns: HTMLDivElement[] = [];
  private domOpponents: HTMLDivElement[] = [];

  private localTimer = 0;
  private timerEvent: Phaser.Time.TimerEvent | null = null;
  private currentSpeed: number = 1;
  private msgHandler: ((msg: ServerMsg) => void) | null = null;
  private hoveredTower: string | null = null;

  constructor() { super({ key: 'GameScene' }); }

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

    this.projectiles = []; this.deathEffects = []; this.damageTexts = []; this.leakEffects = [];
    this.placingTowerType = null; this.placingElements = null; this.gridHover = null;

    this.drawGrid();
    this.createUI();

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.rightButtonDown()) { this.cancelPlacement(); return; }
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

    this.input.keyboard?.on('keydown-ESC', () => { this.cancelPlacement(); this.selectedTowerId = null; this.hideTowerActionMenu(); });
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.gameState.phase === 'prep') socket.send({ type: 'DEV_START_COMBAT' });
    });

    this.msgHandler = (msg) => this.handleMsg(msg);
    socket.onMessage(this.msgHandler);
    this.updateUI();
  }

  shutdown() {
    if (this.msgHandler) socket.offMessage(this.msgHandler);
    if (this.timerEvent) this.timerEvent.destroy();
    if (this.bossSelectOverlay) this.bossSelectOverlay.destroy();
    if (this.towerActionMenu) this.towerActionMenu.destroy();
    this.destroyHUD();
    this.destroyDOMUI();
    this.hideTechTree();
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
        if (msg.phase === 'combat' || msg.phase === 'bossFight') {
          this.hideBossSelectOverlay();
          this.showPhaseFlash(msg.phase === 'bossFight' ? '👑 BOSS FIGHT' : '⚔️ COMBAT');
          sfx.waveStart();
        } else if (msg.phase === 'prep') {
          this.hideBossSelectOverlay();
          this.showPhaseFlash(`🔧 ROUND ${msg.round}`);
        } else if (msg.phase === 'bossSelect') {
          this.showBossSelectOverlay();
          sfx.bossSelect();
        }
        break;
      case 'MOB_SYNC':
        this.gameState.mobs = msg.mobs;
        break;
      case 'COMBAT_EVENTS':
        if (msg.playerId === this.myId) this.onCombatEvents(msg.attacks, msg.kills, msg.leaks);
        break;
      case 'MOB_LEAKED':
        if (msg.playerId === this.myId) {
          const exit = this.mapDef.exit;
          this.spawnFloatingText(GRID_X + exit.col * CELL + CELL / 2, GRID_Y + exit.row * CELL + CELL / 2 - 15, `-${msg.damage} HP`, -25);
        }
        break;
      case 'BOSS_SELECT':
        this.showBossSelectOverlay();
        break;
      case 'BOSS_KILLED':
        if (msg.playerId === this.myId) {
          this.showPhaseFlash(`${ELEMENT_EMOJI[msg.element]} +1 ${msg.element}!`);
          sfx.goldReceived();
        }
        break;
      case 'BOSS_PASS':
        if (msg.playerId === this.myId) {
          this.spawnFloatingText(GRID_X + GRID_PX / 2, GRID_Y + GRID_PX / 2, `Boss loops! -${msg.damage} HP`, -30);
          sfx.leak();
        }
        break;
      case 'TOWER_UPGRADED':
        if (msg.playerId === this.myId) { this.hideTowerActionMenu(); }
        break;
      case 'TOWER_SOLD':
        if (msg.playerId === this.myId) {
          this.spawnFloatingText(GRID_X + GRID_PX / 2, GRID_Y + GRID_PX - 20, `+${msg.refund}cr`, -30);
          sfx.goldReceived();
          this.hideTowerActionMenu();
          this.selectedTowerId = null;
        }
        break;
      case 'PVP_UNIT_SENT':
        if (msg.fromId === this.myId) sfx.goldReceived();
        break;
      case 'SPEED_CHANGE':
        this.currentSpeed = msg.speed;
        this.updateSpeedButtons();
        break;
      case 'NEXT_WAVE_INFO':
        this.nextWaveInfo = msg;
        break;
      case 'GAME_OVER':
        socket.clearHandlers();
        this.scene.start('GameOverScene', { winnerId: msg.winnerId, players: this.gameState.players, myId: this.myId });
        break;
    }
  }

  // ── Boss Select Overlay ───────────────────────────────

  private showBossSelectOverlay() {
    this.hideBossSelectOverlay();
    const cx = GRID_X + GRID_PX / 2;
    const cy = GRID_Y + GRID_PX / 2;

    this.bossSelectOverlay = this.add.container(0, 0).setDepth(20);
    const backdrop = this.add.rectangle(cx, cy, GRID_PX + 200, GRID_PX + 100, 0x000000, 0.85);
    this.bossSelectOverlay.add(backdrop);

    const title = this.add.text(cx, cy - 180, `👑 BOSS ROUND ${this.gameState.round} — Choose Your Element`, {
      fontFamily: FONT, fontSize: '24px', color: '#FFD93D', fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.bossSelectOverlay.add(title);

    const subtitle = this.add.text(cx, cy - 150, 'Kill the boss to earn +1 of that element. Boss loops until dead!', {
      fontFamily: FONT, fontSize: '14px', color: '#aaa',
    }).setOrigin(0.5);
    this.bossSelectOverlay.add(subtitle);

    const me = this.me();
    const cardW = 80;
    const gap = 12;
    const startX = cx - ((ALL_ELEMENTS.length - 1) * (cardW + gap)) / 2;

    ALL_ELEMENTS.forEach((elem, i) => {
      const cardX = startX + i * (cardW + gap);
      const cardY = cy + 20;
      const colorHex = ELEMENT_COLOR_HEX[elem];
      const owned = me?.unlockedElements.includes(elem) ? 1 : 0;

      const bg = this.add.rectangle(cardX, cardY, cardW, 120, colorHex, 0.15);
      bg.setStrokeStyle(2, colorHex);
      bg.setInteractive({ useHandCursor: true });
      this.bossSelectOverlay!.add(bg);

      const emoji = this.add.text(cardX, cardY - 30, ELEMENT_EMOJI[elem], { fontSize: '32px' }).setOrigin(0.5);
      this.bossSelectOverlay!.add(emoji);

      const name = this.add.text(cardX, cardY + 10, elem.toUpperCase(), {
        fontFamily: FONT, fontSize: '11px', color: ELEMENT_COLOR[elem], fontStyle: 'bold',
      }).setOrigin(0.5);
      this.bossSelectOverlay!.add(name);

      const ownedLabel = this.add.text(cardX, cardY + 30, `Owned: ${owned}`, {
        fontFamily: FONT, fontSize: '10px', color: '#888',
      }).setOrigin(0.5);
      this.bossSelectOverlay!.add(ownedLabel);

      bg.on('pointerover', () => { bg.setStrokeStyle(3, 0xffd93d); bg.setScale(1.05); });
      bg.on('pointerout', () => { bg.setStrokeStyle(2, colorHex); bg.setScale(1); });
      bg.on('pointerdown', () => {
        socket.send({ type: 'SELECT_BOSS_ELEMENT', element: elem });
        this.hideBossSelectOverlay();
      });
    });
  }

  private hideBossSelectOverlay() {
    if (this.bossSelectOverlay) { this.bossSelectOverlay.destroy(); this.bossSelectOverlay = null; }
  }

  // ── Combat Events → Visual Effects ────────────────────

  private onCombatEvents(attacks: CombatAttack[], kills: { mobId: string; x: number; y: number; gold: number }[], leaks: string[]) {
    for (const atk of attacks.slice(0, 3)) sfx.towerShoot(atk.element);

    for (const atk of attacks) {
      const sx = GRID_X + atk.towerX * CELL + CELL / 2;
      const sy = GRID_Y + atk.towerY * CELL + CELL / 2;
      const tx = GRID_X + atk.targetX * CELL + CELL / 2;
      const ty = GRID_Y + atk.targetY * CELL + CELL / 2;

      let colorHex = '#ffffff';
      if (atk.towerElement && ELEMENT_COLOR[atk.towerElement]) colorHex = ELEMENT_COLOR[atk.towerElement];
      else if (atk.element === 'blaster') colorHex = '#4EA8DE';
      else if (atk.element === 'railgun') colorHex = '#FF6B35';
      const color = Phaser.Display.Color.HexStringToColor(colorHex).color;

      this.projectiles.push({ x: sx, y: sy, tx, ty, color, speed: 600, alive: true, splash: atk.splash });
    }

    if (kills.length > 0) sfx.mobDeath();
    const hasGold = kills.some(k => k.gold > 0);
    if (hasGold) sfx.goldReceived();
    for (const kill of kills) {
      const mx = GRID_X + kill.x * CELL + CELL / 2;
      const my = GRID_Y + kill.y * CELL + CELL / 2;
      this.deathEffects.push({ x: mx, y: my, radius: 8, alpha: 1, color: 0xFFD93D });
      if (kill.gold > 0) this.spawnFloatingText(mx, my - 15, `+${kill.gold}cr`, -30);
    }

    if (leaks.length > 0) sfx.leak();
    for (const _id of leaks) {
      const ex = GRID_X + this.mapDef.exit.col * CELL + CELL / 2;
      const ey = GRID_Y + this.mapDef.exit.row * CELL + CELL / 2;
      this.leakEffects.push({ x: ex, y: ey, alpha: 1 });
    }
  }

  // ── Effect Updates ────────────────────────────────────

  private updateProjectiles(dt: number) {
    const s = dt / 1000;
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      const dx = p.tx - p.x; const dy = p.ty - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < p.speed * s) p.alive = false;
      else { p.x += (dx / d) * p.speed * s; p.y += (dy / d) * p.speed * s; }
    }
    this.projectiles = this.projectiles.filter(p => p.alive);
  }
  private updateDeathEffects(dt: number) {
    const s = dt / 1000;
    for (const d of this.deathEffects) { d.radius += 80 * s; d.alpha -= 2.5 * s; }
    this.deathEffects = this.deathEffects.filter(d => d.alpha > 0);
  }
  private spawnFloatingText(x: number, y: number, text: string, vy: number = -30) {
    try {
      const isGold = text.startsWith('+');
      const isLeak = text.includes('HP');
      const color = isGold ? '#FFD93D' : isLeak ? '#ff4444' : '#ffffff';
      const obj = this.add.text(x, y, text, { fontSize: '14px', color, fontStyle: 'bold', stroke: '#000', strokeThickness: 4 })
        .setOrigin(0.5).setDepth(25);
      this.damageTexts.push({ x, y, text, alpha: 1, vy, obj });
    } catch { /* scene shutting down */ }
  }
  private updateDamageTexts(dt: number) {
    const s = dt / 1000;
    for (const t of this.damageTexts) { t.y += t.vy * s; t.alpha -= 1.2 * s; if (t.obj) { t.obj.setPosition(t.x, t.y); t.obj.setAlpha(Math.max(0, t.alpha)); } }
    this.damageTexts = this.damageTexts.filter(t => { if (t.alpha <= 0) { t.obj?.destroy(); return false; } return true; });
  }
  private updateLeakEffects(dt: number) {
    const s = dt / 1000;
    for (const l of this.leakEffects) l.alpha -= 2 * s;
    this.leakEffects = this.leakEffects.filter(l => l.alpha > 0);
  }

  // ── Grid Hover ────────────────────────────────────────

  private updateGridHover(ptr: Phaser.Input.Pointer) {
    const col = Math.floor((ptr.x - GRID_X) / CELL);
    const row = Math.floor((ptr.y - GRID_Y) / CELL);
    if (col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE && (this.placingTowerType || this.placingElements)) {
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
        const info = this.getTowerInfoText(tower);
        this.uiTowerHoverInfo.setText(info).setVisible(true);
        this.uiTowerHoverInfo.setPosition(Math.min(ptr.x + 15, this.scale.width - 250), Math.max(ptr.y - 60, 10));
      } else {
        this.hoveredTower = null;
        this.uiTowerHoverInfo.setVisible(false);
      }
    } else {
      this.hoveredTower = null;
      this.uiTowerHoverInfo.setVisible(false);
    }
  }

  private getTowerInfoText(tower: TowerInstance): string {
    if (tower.kind === 'base') {
      const def = BASE_TOWER_MAP[tower.towerType];
      if (!def) return '';
      const stats = getBaseTowerStats(def, tower.tier, tower.t3PlusElement);
      let info = `${stats.displayName}\n${def.description}\n`;
      info += `DMG: ${stats.damage}  SPD: ${stats.attackSpeed}/s  RNG: ${stats.range}\n`;
      if (stats.splashRadius) info += `Splash: ${stats.splashRadius}\n`;
      if (tower.t3PlusElement) info += `Element: ${ELEMENT_EMOJI[tower.t3PlusElement]} ${tower.t3PlusElement}\n`;
      const sellPrice = getTowerSellPrice(tower);
      info += `Sell: ${sellPrice}cr`;
      if (tower.tier < 3) {
        const upgCost = def.upgradeCosts[tower.tier - 1];
        info += `\n⬆ Upgrade: ${upgCost}cr`;
      } else if (!tower.t3PlusElement) {
        info += `\n✨ Apply element for T3+`;
      }
      return info;
    } else {
      const def = ELEMENT_TOWER_MAP[tower.elementTowerId];
      if (!def) return '';
      const stats = getElementTowerStats(def, tower.rank as 1 | 2 | 3);
      let info = `${stats.displayName}\n${def.description}\n`;
      info += `DMG: ${stats.damage}  SPD: ${stats.attackSpeed}/s  RNG: ${stats.range}\n`;
      if (tower.isPure) info += `🌟 PURE TOWER\n`;
      const sellPrice = getTowerSellPrice(tower);
      info += `Sell: ${sellPrice}cr`;
      return info;
    }
  }

  private drawGridPreview() {
    this.previewGfx.clear();
    if (!this.gridHover || (!this.placingTowerType && !this.placingElements)) return;
    const x = GRID_X + this.gridHover.position.col * CELL;
    const y = GRID_Y + this.gridHover.position.row * CELL;
    const valid = this.gridHover.valid;
    this.previewGfx.fillStyle(valid ? 0x44ff44 : 0xff4444, 0.3);
    this.previewGfx.lineStyle(2, valid ? 0x44ff44 : 0xff4444, 0.8);
    this.previewGfx.fillRect(x, y, CELL, CELL);
    this.previewGfx.strokeRect(x, y, CELL, CELL);
  }

  private drawFX() {
    this.fxGfx.clear();
    for (const p of this.projectiles) { this.fxGfx.fillStyle(p.color, 0.9); this.fxGfx.fillCircle(p.x, p.y, p.splash ? 3 : 2); }
    for (const d of this.deathEffects) { this.fxGfx.lineStyle(2, d.color, d.alpha); this.fxGfx.strokeCircle(d.x, d.y, d.radius); }
    for (const l of this.leakEffects) { this.fxGfx.fillStyle(0xff0000, l.alpha * 0.4); this.fxGfx.fillCircle(l.x, l.y, 18); }
  }

  // ── Grid ──────────────────────────────────────────────

  private getMyColorHex(): number {
    const me = this.me();
    if (!me) return 0x00d4ff;
    const map: Record<string, number> = { blue: 0x4A90D9, red: 0xD94A4A, green: 0x4AD97A, orange: 0xD9A04A };
    return map[me.color] || 0x00d4ff;
  }

  private drawGrid() {
    const g = this.gridGfx; g.clear();
    const pColor = this.getMyColorHex();
    g.fillStyle(0x0a0a14, 1); g.fillRect(GRID_X - 2, GRID_Y - 2, GRID_PX + 4, GRID_PX + 4);
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const x = GRID_X + col * CELL; const y = GRID_Y + row * CELL;
        const onPath = isPathCell(this.mapDef, { row, col });
        if (onPath) { g.fillStyle(0x15152a, 1); g.fillRect(x, y, CELL, CELL); g.lineStyle(1, pColor, 0.12); g.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2); }
        else { g.fillStyle(0x0e0e20, 1); g.fillRect(x, y, CELL, CELL); g.fillStyle(pColor, 0.25); g.fillCircle(x + CELL / 2, y + CELL / 2, 1); }
        g.lineStyle(1, 0x1a1a3a, 0.5); g.strokeRect(x, y, CELL, CELL);
      }
    }
    // Path lines
    g.lineStyle(2, pColor, 0.2);
    for (let i = 0; i < this.mapDef.path.length - 1; i++) {
      const a = this.mapDef.path[i]; const b = this.mapDef.path[i + 1];
      g.lineBetween(GRID_X + a.col * CELL + CELL / 2, GRID_Y + a.row * CELL + CELL / 2, GRID_X + b.col * CELL + CELL / 2, GRID_Y + b.row * CELL + CELL / 2);
    }
    // Stars
    for (let i = 0; i < 80; i++) { g.fillStyle(0xffffff, 0.15 + Math.random() * 0.35); g.fillCircle(GRID_X + Math.random() * GRID_PX, GRID_Y + Math.random() * GRID_PX, Math.random() < 0.3 ? 1.5 : 0.8); }

    const entry = this.mapDef.entry; const exit = this.mapDef.exit;
    this.add.text(GRID_X + entry.col * CELL + 8, GRID_Y + entry.row * CELL + 22, '▶ IN', { fontFamily: FONT, fontSize: '12px', color: '#00ff88', fontStyle: 'bold' }).setDepth(0);
    this.add.text(GRID_X + exit.col * CELL + 4, GRID_Y + exit.row * CELL + 22, '✕ EXIT', { fontFamily: FONT, fontSize: '11px', color: '#ff4444', fontStyle: 'bold' }).setDepth(0);
  }

  // ── Mobs ──────────────────────────────────────────────

  private drawMobs() {
    this.mobGfx.clear();
    const myMobs = this.gameState.mobs[this.myId] || [];
    for (const mob of myMobs) {
      const x = GRID_X + mob.x * CELL + CELL / 2;
      const y = GRID_Y + mob.y * CELL + CELL / 2;
      const hpRatio = Math.max(0, mob.hp / mob.maxHp);

      let radius = 6; let borderColor = 0xffffff; let shape: 'circle' | 'square' | 'diamond' = 'circle';
      if (mob.defId === 'boss') { radius = 10; borderColor = 0xffd93d; }
      else if (mob.defId === 'tank' || mob.defId === 'pvp_tank') { radius = 8; borderColor = 0xff6666; shape = 'square'; }
      else if (mob.defId === 'runner' || mob.defId === 'pvp_runner') { radius = 5; borderColor = 0x66ff66; shape = 'diamond'; }
      else if (mob.defId === 'swarm') { radius = 4; borderColor = 0x66ccff; }
      if (mob.isPvp) borderColor = 0x9B5DE5;

      const r = mob.isPvp ? 155 : Math.floor(255 * (1 - hpRatio));
      const gr = mob.isPvp ? 93 : Math.floor(200 * hpRatio + 55);
      const b = mob.isPvp ? 229 : 50;
      const bodyColor = Phaser.Display.Color.GetColor(r, gr, b);

      this.mobGfx.fillStyle(bodyColor, 1);
      if (shape === 'square') this.mobGfx.fillRect(x - radius * 0.7, y - radius * 0.7, radius * 1.4, radius * 1.4);
      else if (shape === 'diamond') { this.mobGfx.fillTriangle(x, y - radius, x + radius, y, x, y + radius); this.mobGfx.fillTriangle(x, y - radius, x - radius, y, x, y + radius); }
      else this.mobGfx.fillCircle(x, y, radius);

      this.mobGfx.lineStyle(1.5, borderColor, 0.8);
      if (shape === 'square') this.mobGfx.strokeRect(x - radius * 0.7, y - radius * 0.7, radius * 1.4, radius * 1.4);
      else if (shape === 'diamond') { this.mobGfx.strokeTriangle(x, y - radius, x + radius, y, x, y + radius); this.mobGfx.strokeTriangle(x, y - radius, x - radius, y, x, y + radius); }
      else this.mobGfx.strokeCircle(x, y, radius);

      // HP bar
      const barW = radius * 2.2; const barH = 3;
      this.mobGfx.fillStyle(0x111111, 0.8); this.mobGfx.fillRect(x - barW / 2, y - radius - 7, barW, barH);
      this.mobGfx.fillStyle(hpRatio > 0.5 ? 0x44ff44 : hpRatio > 0.25 ? 0xffaa00 : 0xff3333, 0.9);
      this.mobGfx.fillRect(x - barW / 2, y - radius - 7, barW * hpRatio, barH);

      if (mob.element) {
        const eHex = ELEMENT_COLOR_HEX[mob.element];
        if (eHex) { this.mobGfx.fillStyle(eHex, 0.7); this.mobGfx.fillCircle(x + radius + 3, y - radius - 3, 3); }
      }
    }
  }

  // ── Towers ────────────────────────────────────────────

  private drawTowers() {
    this.towerGfx.clear();
    const me = this.me();
    if (!me) return;

    for (const tower of me.towers) {
      const cx = GRID_X + tower.position.col * CELL + CELL / 2;
      const cy = GRID_Y + tower.position.row * CELL + CELL / 2;
      const colorStr = getTowerDisplayColor(tower);
      const elemColor = Phaser.Display.Color.HexStringToColor(colorStr).color;
      const size = 12;
      const isHovered = this.hoveredTower === tower.instanceId;
      const isSelected = this.selectedTowerId === tower.instanceId;

      // Get stats for range
      let range = 3;
      if (tower.kind === 'base') {
        const def = BASE_TOWER_MAP[tower.towerType];
        if (def) { const stats = getBaseTowerStats(def, tower.tier, tower.t3PlusElement); range = stats.range; }
      } else {
        const def = ELEMENT_TOWER_MAP[tower.elementTowerId];
        if (def) { const stats = getElementTowerStats(def, tower.rank as 1 | 2 | 3); range = stats.range; }
      }

      // Range circle
      if (isHovered || isSelected) {
        this.towerGfx.fillStyle(elemColor, 0.08);
        this.towerGfx.fillCircle(cx, cy, range * CELL);
        this.towerGfx.lineStyle(2, elemColor, 0.5);
        this.towerGfx.strokeCircle(cx, cy, range * CELL);
      }

      // Base platform
      this.towerGfx.fillStyle(0x111122, 0.6);
      this.towerGfx.fillCircle(cx, cy + 4, size + 2);

      // Tower shape
      this.towerGfx.fillStyle(elemColor, 0.9);
      if (tower.kind === 'base') {
        if (tower.towerType === 'blaster') {
          this.towerGfx.fillTriangle(cx, cy - size, cx - size * 0.8, cy + size * 0.6, cx + size * 0.8, cy + size * 0.6);
        } else {
          this.towerGfx.fillRect(cx - size * 0.7, cy - size * 0.7, size * 1.4, size * 1.4);
        }
      } else {
        // Element tower: hexagon-ish (circle with glow)
        this.towerGfx.fillCircle(cx, cy, size * 0.85);
      }

      // Tier/Rank indicator
      if (tower.kind === 'base' && tower.tier >= 2) {
        this.towerGfx.lineStyle(2, 0xffd93d, 0.8);
        this.towerGfx.strokeCircle(cx, cy, size + 5);
        if (tower.tier >= 3) {
          this.towerGfx.lineStyle(2, tower.t3PlusElement ? 0xff4488 : 0xffd93d, 0.9);
          this.towerGfx.strokeCircle(cx, cy, size + 8);
        }
      } else if (tower.kind === 'element') {
        if (tower.rank >= 2) {
          this.towerGfx.lineStyle(2, 0x44ffaa, 0.8);
          this.towerGfx.strokeCircle(cx, cy, size + 5);
        }
        if (tower.rank >= 3) {
          this.towerGfx.lineStyle(2, 0xff44ff, 0.9);
          this.towerGfx.strokeCircle(cx, cy, size + 8);
        }
      }

      // Element glow for T3+
      if (tower.kind === 'base' && tower.t3PlusElement) {
        const eColor = ELEMENT_COLOR_HEX[tower.t3PlusElement];
        if (eColor) {
          this.towerGfx.lineStyle(2, eColor, 0.5);
          this.towerGfx.strokeCircle(cx, cy, size + 4);
        }
      }

      // Selected highlight
      if (isSelected) {
        this.towerGfx.lineStyle(3, 0x00d4ff, 0.9);
        this.towerGfx.strokeCircle(cx, cy, size + 10);
      }
    }
  }

  // ── Timer ─────────────────────────────────────────────

  private startLocalTimer(seconds: number) {
    this.localTimer = seconds;
    if (this.timerEvent) this.timerEvent.destroy();
    if (seconds <= 0) return;
    this.timerEvent = this.time.addEvent({
      delay: 1000, repeat: seconds - 1,
      callback: () => { this.localTimer = Math.max(0, this.localTimer - 1); this.updatePhaseText(); },
    });
  }

  private showPhaseFlash(text: string) {
    const cx = GRID_X + GRID_PX / 2; const cy = GRID_Y + GRID_PX / 2;
    const flash = this.add.text(cx, cy, text, { fontFamily: FONT, fontSize: '40px', color: '#00d4ff', fontStyle: 'bold', stroke: '#7b2fbe', strokeThickness: 4 })
      .setOrigin(0.5).setDepth(10);
    this.tweens.add({ targets: flash, alpha: 0, y: cy - 40, duration: 1200, ease: 'Power2', onComplete: () => flash.destroy() });
  }

  private updateSpeedButtons() {
    const speeds = [1, 2, 3, 5, 10];
    this.domSpeedBtns.forEach((btn, i) => {
      const active = speeds[i] === this.currentSpeed;
      btn.style.color = active ? '#0a0a14' : '#7a8aaa';
      btn.style.background = active ? '#00d4ff' : '#12122a';
    });
  }

  // ── Actions ───────────────────────────────────────────

  private cancelPlacement() {
    this.placingTowerType = null;
    this.placingElements = null;
    this.updateUI();
  }

  private onGridClick(pos: GridPos) {
    const me = this.me();
    if (!me) return;

    // Check if clicking on existing tower
    const existingTower = me.towers.find(t => t.position.row === pos.row && t.position.col === pos.col);
    if (existingTower) {
      this.selectedTowerId = existingTower.instanceId;
      this.showTowerActionMenu(existingTower);
      this.cancelPlacement();
      return;
    }

    // Place base tower (stay in placement mode for repeated builds)
    if (this.placingTowerType) {
      if (!isPathCell(this.mapDef, pos)) {
        socket.send({ type: 'BUY_BASE_TOWER', towerType: this.placingTowerType, position: pos });
        sfx.towerPlace();
      }
      return;
    }

    // Place element tower (stay in placement mode for repeated builds)
    if (this.placingElements) {
      if (!isPathCell(this.mapDef, pos)) {
        socket.send({ type: 'BUY_ELEMENT_TOWER', elements: this.placingElements, position: pos });
        sfx.towerPlace();
      }
      return;
    }

    // Deselect
    this.selectedTowerId = null;
    this.hideTowerActionMenu();
  }

  // ── Tower Action Menu ─────────────────────────────────

  private showTowerActionMenu(tower: TowerInstance) {
    this.hideTowerActionMenu();
    const x = GRID_X + tower.position.col * CELL + CELL / 2;
    const y = GRID_Y + tower.position.row * CELL + CELL / 2;
    const me = this.me();
    if (!me) return;

    this.towerActionMenu = this.add.container(0, 0).setDepth(20);
    const sellPrice = getTowerSellPrice(tower);

    const panelW = 180; const panelH = 80;
    const panelX = Math.min(x + 70, GRID_X + GRID_PX - panelW / 2);
    const panelY = Math.max(y, GRID_Y + panelH / 2);

    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0d1117, 0.95);
    panel.setStrokeStyle(2, 0x00d4ff, 0.8);
    this.towerActionMenu.add(panel);

    // Sell button
    const sellBtn = this.add.text(panelX - panelW / 2 + 8, panelY - 12, `SELL ${sellPrice}cr`, {
      fontFamily: FONT, fontSize: '11px', color: '#fff', backgroundColor: '#cc3333', padding: { x: 6, y: 4 }, fontStyle: 'bold',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        socket.send({ type: 'SELL_TOWER', instanceId: tower.instanceId });
        this.selectedTowerId = null;
        this.hideTowerActionMenu();
      });
    this.towerActionMenu.add(sellBtn);

    // Upgrade button
    if (tower.kind === 'base') {
      if (tower.tier < 3) {
        const def = BASE_TOWER_MAP[tower.towerType];
        if (def) {
          const cost = def.upgradeCosts[tower.tier - 1];
          const canAfford = me.credits >= cost;
          const upBtn = this.add.text(panelX + 20, panelY - 12, `⬆ T${tower.tier + 1} (${cost}cr)`, {
            fontFamily: FONT, fontSize: '11px', color: canAfford ? '#fff' : '#666',
            backgroundColor: canAfford ? '#33aa33' : '#333', padding: { x: 6, y: 4 }, fontStyle: 'bold',
          }).setOrigin(0, 0.5);
          if (canAfford) {
            upBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
              socket.send({ type: 'UPGRADE_BASE_TOWER', towerId: tower.instanceId });
              this.hideTowerActionMenu();
            });
          }
          this.towerActionMenu.add(upBtn);
        }
      } else if (!tower.t3PlusElement) {
        // T3+ element application buttons
        const elemY = panelY + 10;
        let btnIdx = 0;
        for (const elem of ALL_ELEMENTS) {
          const owned = me.unlockedElements.includes(elem) ? 1 : 0;
          if (owned <= 0) continue;
          const bx = panelX - panelW / 2 + 10 + btnIdx * 26;
          const btn = this.add.rectangle(bx + 10, elemY, 22, 22, ELEMENT_COLOR_HEX[elem], 0.8)
            .setStrokeStyle(1, 0xffffff)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              socket.send({ type: 'APPLY_T3_ELEMENT', towerId: tower.instanceId, element: elem });
              this.hideTowerActionMenu();
            });
          this.towerActionMenu.add(btn);
          const label = this.add.text(bx + 10, elemY, ELEMENT_EMOJI[elem], { fontSize: '10px' }).setOrigin(0.5);
          this.towerActionMenu.add(label);
          btnIdx++;
        }
      }
    } else if (tower.kind === 'element') {
      // Element tower upgrade
      if (tower.rank < 3) {
        const def = ELEMENT_TOWER_MAP[tower.elementTowerId];
        if (def) {
          const creditCost = getElementUpgradeCreditCost(def, tower.rank as 1 | 2);
          const canAfford = creditCost > 0 && me.credits >= creditCost;
          const costStr = creditCost > 0 ? `${creditCost}¢` : '';

          // For pure (rank 3), check pure slot
          const isPureUpgrade = tower.rank === 2 && def.elements.length === 1;
          const canGoPure = isPureUpgrade && me.pureTowerSlot === null;

          if (costStr && (tower.rank === 1 || canGoPure)) {
            const upBtn = this.add.text(panelX + 20, panelY - 12, `⬆ R${tower.rank + 1} (${costStr})`, {
              fontFamily: FONT, fontSize: '11px', color: canAfford && (!isPureUpgrade || canGoPure) ? '#fff' : '#666',
              backgroundColor: canAfford && (!isPureUpgrade || canGoPure) ? '#33aa33' : '#333', padding: { x: 6, y: 4 }, fontStyle: 'bold',
            }).setOrigin(0, 0.5);
            if (canAfford && (!isPureUpgrade || canGoPure)) {
              upBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
                socket.send({ type: 'UPGRADE_ELEMENT_TOWER', towerId: tower.instanceId });
                this.hideTowerActionMenu();
              });
            }
            this.towerActionMenu.add(upBtn);
          }
        }
      }
    }
  }

  private hideTowerActionMenu() {
    if (this.towerActionMenu) { this.towerActionMenu.destroy(); this.towerActionMenu = null; }
  }

  // ── Opponent Mini-View ────────────────────────────────

  private drawOpponentMiniViews() {
    this.miniGfx.clear();
    const opponents = this.gameState.players.filter(p => p.id !== this.myId && p.alive);
    const miniCell = 6; const miniSize = miniCell * GRID_SIZE;

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
        const colorStr = getTowerDisplayColor(tower);
        const c = Phaser.Display.Color.HexStringToColor(colorStr).color;
        this.miniGfx.fillStyle(c, 0.9);
        this.miniGfx.fillRect(baseX + tower.position.col * miniCell + 1, baseY + tower.position.row * miniCell + 1, miniCell - 2, miniCell - 2);
      }

      const oppMobs = this.gameState.mobs[opp.id] || [];
      for (const mob of oppMobs) {
        this.miniGfx.fillStyle(0xff4444, 0.8);
        this.miniGfx.fillCircle(baseX + mob.x * miniCell + miniCell / 2, baseY + mob.y * miniCell + miniCell / 2, 2);
      }
    });
  }

  // ── UI ────────────────────────────────────────────────

  private createUI() {
    this.createHUD();
    this.createDOMUI();
    this.uiTowerHoverInfo = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '12px', color: '#ffffff', backgroundColor: '#0d1117cc',
      padding: { x: 8, y: 6 }, stroke: '#00d4ff', strokeThickness: 1,
      fixedWidth: 240, wordWrap: { width: 220 },
    }).setOrigin(0, 0).setDepth(10);
  }

  private createDOMUI() {
    this.destroyDOMUI();
    const container = this.game.canvas.parentElement;
    if (!container) return;
    container.style.position = 'relative';
    const W = 1280, H = 800;
    const pct = (gx: number, gy: number) => ({ left: `${(gx / W * 100).toFixed(2)}%`, top: `${(gy / H * 100).toFixed(2)}%` });

    const root = document.createElement('div');
    root.id = 'game-ui';
    Object.assign(root.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '5', fontFamily: "'Chakra Petch', system-ui, sans-serif", color: '#e0e8ff', fontSize: '12px' });
    container.appendChild(root);
    this.gameUiEl = root;

    const mkDiv = (parent: HTMLElement, styles: Record<string, string> = {}): HTMLDivElement => {
      const d = document.createElement('div'); Object.assign(d.style, styles); parent.appendChild(d); return d;
    };
    const btnBase: Record<string, string> = { pointerEvents: 'auto', cursor: 'pointer', borderRadius: '6px', fontFamily: "'Chakra Petch', system-ui, sans-serif", fontWeight: '600', userSelect: 'none', textAlign: 'center', whiteSpace: 'nowrap' };

    // ── Mute button ──
    const mutePos = pct(GRID_X + GRID_PX - 30, 42);
    const muteBtn = mkDiv(root, { ...btnBase, position: 'absolute', ...mutePos, fontSize: '18px', padding: '2px' });
    muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
    muteBtn.onclick = () => { muteBtn.textContent = sfx.toggle() ? '🔇' : '🔊'; };

    // ── Speed buttons ──
    const speeds = [1, 2, 3, 5, 10];
    const speedStartX = GRID_X + GRID_PX - speeds.length * 34;
    this.domSpeedBtns = [];
    speeds.forEach((s, i) => {
      const sp = pct(speedStartX + i * 34, GRID_Y - 28);
      const btn = mkDiv(root, { ...btnBase, position: 'absolute', ...sp, fontSize: '12px', padding: '3px 5px', color: s === 1 ? '#0a0a14' : '#7a8aaa', background: s === 1 ? '#00d4ff' : '#12122a', border: '1px solid rgba(0,212,255,0.3)' });
      btn.textContent = `×${s}`;
      btn.onclick = () => socket.send({ type: 'SET_SPEED', speed: s });
      this.domSpeedBtns.push(btn);
    });

    // ── Opponents (left sidebar) ──
    this.domOpponents = [];
    for (let i = 0; i < 3; i++) {
      const d = mkDiv(root, { position: 'absolute', ...pct(10, GRID_Y + i * 70), fontSize: '13px', background: 'rgba(13,17,23,0.9)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(0,212,255,0.2)', width: '185px', lineHeight: '1.4' });
      this.domOpponents.push(d);
    }

    // ── Tower Buy Panel (bottom-left below grid) ──
    const shopY = GRID_Y + GRID_PX + 12;

    // Base towers
    const baseTowerLabel = mkDiv(root, { position: 'absolute', ...pct(GRID_X, shopY - 2), fontSize: '11px', color: '#666', fontWeight: '700' });
    baseTowerLabel.textContent = 'BASE TOWERS';

    BASE_TOWER_DEFS.forEach((def, i) => {
      const btn = mkDiv(root, { ...btnBase, position: 'absolute', ...pct(GRID_X + i * 140, shopY + 14), fontSize: '13px', padding: '8px', width: '130px', minHeight: '40px', background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(0,212,255,0.3)', color: '#e0e8ff', textAlign: 'left', lineHeight: '1.3' });
      btn.id = `base-tower-btn-${def.towerType}`;
      btn.innerHTML = `<span style="color:${def.towerType === 'blaster' ? '#4EA8DE' : '#FF6B35'}">■</span> ${def.name}<br><span style="color:#ffc107">${def.cost}cr</span> <span style="color:#888;font-size:10px">${def.description}</span>`;
      btn.onclick = () => {
        this.placingTowerType = def.towerType;
        this.placingElements = null;
      };
    });

    // Element inventory + element tower buttons (right side)
    const elemPanelPos = pct(GRID_X + GRID_PX + 10, GRID_Y);
    const elemPanel = mkDiv(root, { position: 'absolute', ...elemPanelPos, fontSize: '12px', background: 'rgba(13,17,23,0.9)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(0,212,255,0.2)', width: '180px', lineHeight: '1.5' });
    elemPanel.id = 'elem-panel';

    // PvP Shop panel (left sidebar, below opponents)
    const pvpPos = pct(10, GRID_Y + 250);
    const pvpPanel = mkDiv(root, { position: 'absolute', ...pvpPos, background: 'rgba(13,17,23,0.9)', padding: '8px', borderRadius: '6px', border: '2px solid rgba(123,47,190,0.6)', width: '200px', pointerEvents: 'auto' });
    pvpPanel.id = 'pvp-panel';

    // Tech Tree button
    const techPos = pct(GRID_X + 300, shopY + 14);
    const techBtn = mkDiv(root, { ...btnBase, position: 'absolute', ...techPos, fontSize: '13px', color: '#e0e8ff', background: '#7b2fbe', padding: '7px 10px' });
    techBtn.textContent = 'TECH TREE';
    techBtn.onclick = () => this.showTechTree();

    // Send Wave button
    const wavePos = pct(GRID_X + 420, shopY + 14);
    const waveBtn = mkDiv(root, { ...btnBase, position: 'absolute', ...wavePos, fontSize: '13px', color: '#e0e8ff', background: '#ff4444', padding: '7px 10px' });
    waveBtn.textContent = '▶ [Space] Send Wave';
    waveBtn.onclick = () => socket.send({ type: 'DEV_START_COMBAT' });

    // Instructions
    const instrPos = pct(GRID_X, shopY + 80);
    mkDiv(root, { position: 'absolute', ...instrPos, fontSize: '11px', color: '#666', fontWeight: '700' }).textContent = 'Click tower to buy → click grid to place | Click placed tower for menu | [E] sell | [Esc] cancel';
  }

  private destroyDOMUI() {
    if (this.gameUiEl) { this.gameUiEl.remove(); this.gameUiEl = null; }
    this.domSpeedBtns = []; this.domOpponents = [];
  }

  private createHUD() {
    this.destroyHUD();
    const hud = document.createElement('div');
    hud.id = 'game-hud';
    Object.assign(hud.style, { position: 'absolute', top: '0', left: '0', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px 16px', padding: '8px 12px', width: '100%', zIndex: '10', pointerEvents: 'none', fontFamily: FONT, color: '#e0e8ff', fontSize: '14px', background: 'rgba(10,10,20,0.8)' });
    const left = document.createElement('span'); left.style.color = '#ffc107'; left.style.fontWeight = 'bold';
    const center = document.createElement('span'); center.style.color = '#00d4ff';
    const right = document.createElement('span'); right.style.color = '#aabbdd'; right.style.textAlign = 'right';
    hud.append(left, center, right);
    const container = this.game.canvas.parentElement;
    if (container) { container.style.position = 'relative'; container.appendChild(hud); }
    this.hudEl = hud; this.hudLeft = left; this.hudCenter = center; this.hudRight = right;
  }

  private destroyHUD() {
    if (this.hudEl) { this.hudEl.remove(); this.hudEl = null; this.hudLeft = null; this.hudCenter = null; this.hudRight = null; }
  }

  private updateUI() {
    const me = this.me();
    if (!me) return;

    // HUD
    if (this.hudLeft) {
      const elemSummary = me.unlockedElements
        .map(e => `${ELEMENT_EMOJI[e]}`).join(' ');
      this.hudLeft.textContent = `❤️ ${me.hp}   💰 ${me.credits}cr   📈 +${me.income}/rnd   ${elemSummary}`;
    }
    this.updatePhaseText();

    // Grey out base tower buttons when can't afford
    for (const def of BASE_TOWER_DEFS) {
      const btn = document.getElementById(`base-tower-btn-${def.towerType}`);
      if (btn) btn.style.opacity = me.credits >= def.cost ? '1' : '0.4';
    }

    // Element panel
    const elemPanel = document.getElementById('elem-panel');
    if (elemPanel) {
      let html = '<div style="font-weight:700;color:#00d4ff;margin-bottom:4px">ELEMENTS</div>';
      for (const elem of ALL_ELEMENTS) {
        const qty = me.unlockedElements.includes(elem) ? 1 : 0;
        if (qty > 0) {
          html += `<div>${ELEMENT_EMOJI[elem]} ${elem}: <span style="color:#4ade80">✓</span></div>`;
        }
      }
      if (me.unlockedElements.length === 0) {
        html += '<div style="color:#666">(none — defeat bosses!)</div>';
      }

      // Available element towers to build
      html += '<div style="font-weight:700;color:#00d4ff;margin-top:8px;margin-bottom:4px">BUILD</div>';

      // Mono towers
      for (const elem of ALL_ELEMENTS) {
        if (me.unlockedElements.includes(elem)) {
          const def = ELEMENT_TOWER_DEFS.find(d => d.elements.length === 1 && d.elements[0] === elem);
          const cost = def?.creditCost || 100;
          const afford = me.credits >= cost;
          html += `<div class="elem-build-btn" data-elements="${elem}" style="cursor:pointer;pointer-events:auto;padding:2px 4px;margin:2px 0;border-radius:4px;background:${ELEMENT_COLOR[elem]}22;border:1px solid ${ELEMENT_COLOR[elem]}66;opacity:${afford ? '1' : '0.5'}">${ELEMENT_EMOJI[elem]} ${elem} Tower (${cost}¢)</div>`;
        }
      }

      // Combo towers
      for (const combo of COMBO_DEFS) {
        const [e1, e2] = combo.elements;
        if (me.unlockedElements.includes(e1) && me.unlockedElements.includes(e2)) {
          const def = ELEMENT_TOWER_DEFS.find(d => d.comboId === combo.id);
          const cost = def?.creditCost || 150;
          const afford = me.credits >= cost;
          html += `<div class="elem-build-btn" data-elements="${e1},${e2}" style="cursor:pointer;pointer-events:auto;padding:2px 4px;margin:2px 0;border-radius:4px;background:${combo.color}22;border:1px solid ${combo.color}66;opacity:${afford ? '1' : '0.5'}">${ELEMENT_EMOJI[e1]}+${ELEMENT_EMOJI[e2]} ${combo.name} (${cost}¢)</div>`;
        }
      }

      elemPanel.innerHTML = html;

      // Attach click handlers
      elemPanel.querySelectorAll('.elem-build-btn').forEach(btn => {
        (btn as HTMLElement).onclick = () => {
          const elems = (btn as HTMLElement).dataset.elements!.split(',') as Element[];
          this.placingElements = elems;
          this.placingTowerType = null;
        };
      });
    }

    // PvP panel
    const pvpPanel = document.getElementById('pvp-panel');
    if (pvpPanel) {
      let html = '<div style="font-weight:700;color:#7b2fbe;text-align:center;margin-bottom:6px">PVP SHOP</div>';
      html += `<div style="font-size:11px;color:#888;text-align:center;margin-bottom:4px">Buy units → send to opponents → gain income</div>`;

      const opponents = this.gameState.players.filter(p => p.id !== this.myId && p.alive);

      for (const unitDef of PVP_UNIT_DEFS) {
        const canAfford = me.credits >= unitDef.cost;
        html += `<div style="margin:4px 0;padding:4px;border-radius:4px;background:#7b2fbe22;border:1px solid #7b2fbe66">`;
        html += `<div style="font-weight:bold;color:#e0e8ff">${unitDef.name} <span style="color:${canAfford ? '#ffc107' : '#ff4444'}">${unitDef.cost}cr</span> <span style="color:#44ff44;font-size:10px">+${unitDef.incomeBonus}/rnd</span></div>`;
        html += `<div style="font-size:10px;color:#888">${unitDef.description}</div>`;

        // Target buttons
        html += '<div style="display:flex;gap:4px;margin-top:2px">';
        for (const opp of opponents) {
          html += `<div class="pvp-send-btn" data-unit="${unitDef.id}" data-target="${opp.id}" style="cursor:pointer;pointer-events:auto;padding:2px 6px;border-radius:3px;background:#7b2fbe;color:#fff;font-size:10px;opacity:${canAfford ? '1' : '0.4'}">${opp.name}</div>`;
        }
        if (opponents.length === 0) html += '<span style="color:#666;font-size:10px">No targets</span>';
        html += '</div></div>';
      }

      pvpPanel.innerHTML = html;

      pvpPanel.querySelectorAll('.pvp-send-btn').forEach(btn => {
        (btn as HTMLElement).onclick = () => {
          const unitId = (btn as HTMLElement).dataset.unit!;
          const targetId = (btn as HTMLElement).dataset.target!;
          socket.send({ type: 'BUY_PVP_UNIT', unitId, targetPlayerId: targetId });
        };
      });
    }

    // Opponents
    const opponents = this.gameState.players.filter(p => p.id !== this.myId);
    opponents.forEach((opp, i) => {
      if (i < this.domOpponents.length) {
        const status = opp.alive ? `❤️ ${opp.hp}` : '💀';
        const pColor = PLAYER_COLOR_HEX[opp.color];
        this.domOpponents[i].innerHTML = `<span style="color:${pColor};font-weight:700">${opp.name}</span><br>${status} | 📈+${opp.income}/rnd`;
        this.domOpponents[i].style.display = '';
      }
    });
    for (let i = opponents.length; i < this.domOpponents.length; i++) this.domOpponents[i].style.display = 'none';
  }

  private updatePhaseText() {
    const phaseMap: Record<string, string> = { prep: '🔧 PREP', combat: '⚔️ COMBAT', bossSelect: '👑 BOSS', bossFight: '👑 BOSS FIGHT' };
    const phase = phaseMap[this.gameState.phase] || this.gameState.phase;
    const timer = this.localTimer > 0 ? `⏱ ${this.localTimer}s` : '';
    if (this.hudCenter) this.hudCenter.textContent = `📍 Round ${this.gameState.round}/30  ${phase}  ${timer}`;

    let rightText = '';
    if (this.nextWaveInfo && this.gameState.phase === 'prep') {
      const icons: Record<string, string> = { boss: '👑', tank: '🛡️', runner: '🏃', swarm: '🐛' };
      rightText = `Next: ${icons[this.nextWaveInfo.mobType] || '👹'} ${this.nextWaveInfo.mobType} ×${this.nextWaveInfo.count} HP:${this.nextWaveInfo.hp}`;
    }
    if (this.hudRight) this.hudRight.textContent = rightText;
  }

  // ── Tech Tree ─────────────────────────────────────────

  private showTechTree() {
    if (this.techTreeVisible) { this.hideTechTree(); return; }
    this.techTreeVisible = true;
    const me = this.me();
    const container = document.getElementById('game-container');
    if (!container) return;

    const overlay = document.createElement('div');
    overlay.id = 'tech-tree-overlay';
    Object.assign(overlay.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', background: 'rgba(0,0,0,0.92)', zIndex: '50', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: "'Chakra Petch', system-ui, sans-serif", color: '#e0e8ff', overflow: 'auto', padding: '20px 10px' });
    container.appendChild(overlay);
    this.techTreeDOM = overlay;

    const titleBar = document.createElement('div');
    Object.assign(titleBar.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '800px', marginBottom: '16px' });
    const title = document.createElement('div');
    title.textContent = 'ELEMENT COMBO TECH TREE';
    Object.assign(title.style, { fontSize: '20px', fontWeight: 'bold', color: '#FFD93D' });
    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, { fontSize: '22px', color: '#ff4444', cursor: 'pointer', padding: '4px 8px' });
    closeBtn.onclick = () => this.hideTechTree();
    titleBar.appendChild(title); titleBar.appendChild(closeBtn);
    overlay.appendChild(titleBar);

    // Element row
    const elemRow = document.createElement('div');
    Object.assign(elemRow.style, { display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' });
    overlay.appendChild(elemRow);

    ALL_ELEMENTS.forEach(elem => {
      const owned = me?.unlockedElements.includes(elem) ? 1 : 0;
      const node = document.createElement('div');
      Object.assign(node.style, { width: '80px', textAlign: 'center', padding: '8px 4px', borderRadius: '8px', border: `2px solid ${owned > 0 ? ELEMENT_COLOR[elem] : '#333'}`, background: owned > 0 ? 'rgba(255,255,255,0.08)' : 'rgba(30,30,40,0.8)', opacity: owned > 0 ? '1' : '0.4' });
      node.innerHTML = `<div style="font-size:24px">${ELEMENT_EMOJI[elem]}</div><div style="font-size:11px;font-weight:bold;color:${ELEMENT_COLOR[elem]};margin-top:2px">${elem.toUpperCase()}</div><div style="font-size:10px;color:#ffc107">${owned > 0 ? `×${owned}` : ''}</div>`;
      elemRow.appendChild(node);
    });

    // Combo cards
    const treeArea = document.createElement('div');
    Object.assign(treeArea.style, { position: 'relative', width: '100%', maxWidth: '800px' });
    overlay.appendChild(treeArea);

    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '16px' });
    treeArea.appendChild(row);

    COMBO_DEFS.forEach(combo => {
      const hasE1 = me?.unlockedElements.includes(combo.elements[0]);
      const hasE2 = me?.unlockedElements.includes(combo.elements[1]);
      const unlocked = hasE1 && hasE2;
      const partial = hasE1 || hasE2;

      const card = document.createElement('div');
      Object.assign(card.style, { width: '105px', padding: '8px', borderRadius: '8px', border: `2px solid ${unlocked ? combo.color : partial ? combo.color + '66' : '#222'}`, background: unlocked ? combo.color + '22' : 'rgba(20,20,30,0.9)', opacity: unlocked ? '1' : partial ? '0.7' : '0.35' });
      card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-size:16px">${ELEMENT_EMOJI[combo.elements[0]]}</span><span style="font-size:10px;color:#666">+</span><span style="font-size:16px">${ELEMENT_EMOJI[combo.elements[1]]}</span></div><div style="font-size:12px;font-weight:bold;color:${combo.color}">${combo.name}</div><div style="font-size:10px;color:#999;margin-top:3px;line-height:1.3">${combo.description}</div>${unlocked ? '<div style="position:absolute;top:4px;right:6px;font-size:10px;color:#4f4">✓</div>' : ''}`;
      row.appendChild(card);
    });
  }

  private hideTechTree() {
    this.techTreeVisible = false;
    if (this.techTreeDOM) { this.techTreeDOM.remove(); this.techTreeDOM = null; }
  }

  private me(): PlayerState | undefined {
    return this.gameState.players.find(p => p.id === this.myId);
  }
}
