import Phaser from 'phaser';
import { socket } from '../network/socket';
import type { ServerMsg, LobbyPlayer, GameConfig, PlayerColor } from '@ect/shared';

const FONT = "'Chakra Petch', 'Segoe UI', system-ui, sans-serif";
import { DEFAULT_GAME_CONFIG, PLAYER_COLORS, PLAYER_COLOR_HEX } from '@ect/shared';

const COMMANDER_NAMES = [
  'Orion', 'Nova', 'Vega', 'Cosmo', 'Stellar', 'Nebula', 'Astro', 'Quasar',
  'Pulsar', 'Photon', 'Eclipse', 'Zenith', 'Comet', 'Blazar', 'Helix',
];

export class LobbyScene extends Phaser.Scene {
  private playerTexts: Phaser.GameObjects.Text[] = [];
  private myId: string = '';
  private isHost: boolean = false;
  private config: GameConfig = { ...DEFAULT_GAME_CONFIG };
  private domElements: HTMLElement[] = [];
  private wrapper: HTMLDivElement | null = null;
  private currentRoomCode: string = '';
  private players: LobbyPlayer[] = [];

  constructor() {
    super({ key: 'LobbyScene' });
  }

  init(data?: { forceReconnect?: boolean }) {
    this.data.set('forceReconnect', data?.forceReconnect || false);
  }

  create() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    // ── Starfield background ──
    const starGfx = this.add.graphics();
    const stars: { x: number; y: number; r: number; base: number }[] = [];
    for (let i = 0; i < 200; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() < 0.2 ? 1.8 : 0.8,
        base: 0.2 + Math.random() * 0.5,
      });
    }

    // Nebula patches
    const nebulaGfx = this.add.graphics();
    nebulaGfx.fillStyle(0x7b2fbe, 0.04);
    nebulaGfx.fillCircle(w * 0.2, h * 0.3, 120);
    nebulaGfx.fillStyle(0x00d4ff, 0.03);
    nebulaGfx.fillCircle(w * 0.8, h * 0.7, 100);
    nebulaGfx.fillStyle(0xd94a4a, 0.025);
    nebulaGfx.fillCircle(w * 0.6, h * 0.15, 80);

    // Floating planets/asteroids
    const planets: { gfx: Phaser.GameObjects.Graphics; vx: number; vy: number; x: number; y: number }[] = [];
    const planetDefs = [
      { x: 120, y: 150, r: 18, color: 0x4A90D9, alpha: 0.3 },
      { x: 800, y: 100, r: 12, color: 0xD9A04A, alpha: 0.25 },
      { x: 700, y: 600, r: 24, color: 0x4AD97A, alpha: 0.2 },
      { x: 150, y: 550, r: 8, color: 0xD94A4A, alpha: 0.35 },
      { x: 500, y: 80, r: 6, color: 0x9b59b6, alpha: 0.3 },
    ];
    planetDefs.forEach(p => {
      const g = this.add.graphics();
      g.fillStyle(p.color, p.alpha);
      g.fillCircle(0, 0, p.r);
      g.setPosition(p.x, p.y);
      planets.push({ gfx: g, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.2, x: p.x, y: p.y });
    });

    // Animate stars + planets
    this.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => {
        starGfx.clear();
        stars.forEach(s => {
          const flicker = s.base + Math.sin(this.time.now * 0.003 + s.x) * 0.15;
          starGfx.fillStyle(0xffffff, Math.max(0.05, Math.min(0.8, flicker)));
          starGfx.fillCircle(s.x, s.y, s.r);
        });
        planets.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -30 || p.x > w + 30) p.vx *= -1;
          if (p.y < -30 || p.y > h + 30) p.vy *= -1;
          p.gfx.setPosition(p.x, p.y);
        });
      },
    });

    // ── DOM UI ──
    this.buildDOM();

    // ── Connect ──
    socket.clearHandlers();
    const handler = (msg: ServerMsg) => this.handleMsg(msg);
    this.setStatus('connecting', '🔄 Connecting to Space Station...');

    socket.reconnect().then(() => {
      socket.onMessage(handler);
      this.setStatus('ok', '✅ Connected — Enter name and launch');
    }).catch(() => {
      this.setStatus('error', '❌ Cannot connect to Space Station');
    });
  }

  // ── DOM UI ──────────────────────────────────────────

  private nameInput!: HTMLInputElement;
  private codeInput!: HTMLInputElement;
  private statusEl!: HTMLDivElement;
  private roomSection!: HTMLDivElement;
  private playerList!: HTMLDivElement;
  private configSection!: HTMLDivElement;
  private joinSection!: HTMLDivElement;
  private launchBtn!: HTMLButtonElement;
  private configSliders: { key: keyof GameConfig; input: HTMLInputElement; valueLabel: HTMLSpanElement }[] = [];

  private buildDOM() {
    const container = document.getElementById('game-container')!;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: flex-start; padding: 30px 20px 20px;
      font-family: 'Segoe UI', system-ui, sans-serif; color: #e0e8ff;
      z-index: 10; overflow-y: auto; pointer-events: auto;
    `;
    this.wrapper = wrapper;

    // Title
    const title = document.createElement('div');
    title.textContent = '🚀 COSMIC TD';
    title.style.cssText = `
      font-size: 42px; font-weight: 900; color: #00d4ff; text-align: center;
      text-shadow: 0 0 20px #00d4ff, 0 0 40px #00d4ff, 0 0 80px #0088aa;
      letter-spacing: 4px; margin-bottom: 6px;
    `;
    wrapper.appendChild(title);

    // Subtitle with typing animation
    const subtitle = document.createElement('div');
    subtitle.style.cssText = `
      font-size: 15px; color: #7a8aaa; text-align: center; margin-bottom: 20px;
      height: 20px; overflow: hidden;
    `;
    wrapper.appendChild(subtitle);
    this.typeText(subtitle, 'Auto-Chess × Tower Defense — In Space', 50);

    // Status
    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText = `font-size: 13px; margin-bottom: 16px; text-align: center;`;
    wrapper.appendChild(this.statusEl);

    // ── Join section ──
    this.joinSection = document.createElement('div');
    this.joinSection.style.cssText = `
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      background: rgba(13,17,23,0.85); border: 1px solid rgba(0,212,255,0.3);
      border-radius: 12px; padding: 20px 30px; width: 380px; max-width: 90%;
    `;

    // Name
    this.nameInput = this.styledInput('Commander name...', 300);
    const savedName = localStorage.getItem('ect_playerName');
    if (savedName) this.nameInput.value = savedName;
    this.joinSection.appendChild(this.labeledField('COMMANDER NAME', this.nameInput));

    // Room code
    this.codeInput = this.styledInput('Enter room code or leave empty to create', 300);
    // Auto-fill from URL param
    const urlRoom = new URLSearchParams(window.location.search).get('room');
    if (urlRoom) this.codeInput.value = urlRoom;
    this.joinSection.appendChild(this.labeledField('ROOM CODE', this.codeInput));

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 10px; margin-top: 4px;';

    const joinBtn = this.styledButton('⚡ JOIN / CREATE', '#00d4ff', () => this.joinLobby());
    const quickBtn = this.styledButton('🎲 QUICK PLAY', '#9b59b6', () => this.quickPlay());
    btnRow.appendChild(joinBtn);
    btnRow.appendChild(quickBtn);
    this.joinSection.appendChild(btnRow);

    wrapper.appendChild(this.joinSection);

    // ── Room section (hidden until joined) ──
    this.roomSection = document.createElement('div');
    this.roomSection.style.cssText = `
      display: none; flex-direction: column; align-items: center; gap: 14px;
      width: 500px; max-width: 95%; animation: fadeSlideIn 0.4s ease;
    `;

    // Room code display
    const roomCodeBox = document.createElement('div');
    roomCodeBox.style.cssText = `
      display: flex; align-items: center; gap: 10px; background: rgba(0,212,255,0.08);
      border: 2px solid #00d4ff; border-radius: 10px; padding: 12px 20px;
    `;
    const roomCodeValue = document.createElement('input');
    roomCodeValue.readOnly = true;
    roomCodeValue.id = 'room-code-display';
    roomCodeValue.style.cssText = `
      background: none; border: none; color: #00d4ff; font-size: 28px; font-weight: 900;
      font-family: monospace; letter-spacing: 3px; width: 160px; text-align: center;
      outline: none; cursor: text; user-select: all;
    `;
    const copyBtn = this.styledButton('📋 COPY', '#00d4ff', () => this.copyRoomCode());
    copyBtn.id = 'copy-room-btn';
    roomCodeBox.appendChild(roomCodeValue);
    roomCodeBox.appendChild(copyBtn);
    this.roomSection.appendChild(roomCodeBox);

    // Join URL
    const joinUrl = document.createElement('div');
    joinUrl.id = 'join-url';
    joinUrl.style.cssText = `font-size: 11px; color: #556; user-select: all; cursor: text;`;
    this.roomSection.appendChild(joinUrl);

    // Player list + config in a row
    const midRow = document.createElement('div');
    midRow.style.cssText = 'display: flex; gap: 16px; width: 100%;';

    // Player cards
    this.playerList = document.createElement('div');
    this.playerList.style.cssText = `
      flex: 1; display: flex; flex-direction: column; gap: 8px;
      background: rgba(13,17,23,0.8); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px; padding: 14px;
    `;
    const plTitle = document.createElement('div');
    plTitle.textContent = '👨‍🚀 CREW';
    plTitle.style.cssText = 'font-size: 13px; color: #7a8aaa; font-weight: 700; letter-spacing: 2px; margin-bottom: 4px;';
    this.playerList.appendChild(plTitle);
    midRow.appendChild(this.playerList);

    // Config
    this.configSection = document.createElement('div');
    this.configSection.style.cssText = `
      width: 200px; background: rgba(13,17,23,0.8); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px; padding: 14px; font-size: 13px;
    `;
    this.buildConfigSliders();
    midRow.appendChild(this.configSection);
    this.roomSection.appendChild(midRow);

    // Launch button
    this.launchBtn = document.createElement('button');
    this.launchBtn.textContent = '🚀 READY UP';
    this.launchBtn.style.cssText = `
      background: linear-gradient(135deg, #00d4ff, #0088aa); color: #000; font-weight: 900;
      font-size: 18px; border: none; border-radius: 10px; padding: 14px 40px;
      cursor: pointer; letter-spacing: 2px; transition: all 0.2s;
    `;
    this.launchBtn.addEventListener('click', () => this.toggleReady());
    this.launchBtn.addEventListener('mouseenter', () => { this.launchBtn.style.transform = 'scale(1.05)'; });
    this.launchBtn.addEventListener('mouseleave', () => { this.launchBtn.style.transform = 'scale(1)'; });
    this.roomSection.appendChild(this.launchBtn);

    wrapper.appendChild(this.roomSection);

    // ── HOW TO PLAY ──
    const howTo = document.createElement('details');
    howTo.style.cssText = `
      margin-top: 16px; width: 500px; max-width: 95%; background: rgba(13,17,23,0.7);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 16px;
      color: #7a8aaa; font-size: 12px; cursor: pointer;
    `;
    howTo.innerHTML = `
      <summary style="font-weight:700;color:#00d4ff;letter-spacing:1px;font-size:13px;outline:none;">📖 HOW TO PLAY</summary>
      <div style="margin-top:10px;line-height:1.7;color:#99a;">
        <b style="color:#e0e8ff">1.</b> Buy towers from the shop each round<br>
        <b style="color:#e0e8ff">2.</b> Place them on the grid to defend your base<br>
        <b style="color:#e0e8ff">3.</b> Match 3 of the same tower to upgrade (★ star up)<br>
        <b style="color:#e0e8ff">4.</b> Combine element synergies for bonus effects<br>
        <b style="color:#e0e8ff">5.</b> Survive more waves than your opponents!<br>
        <br>
        <span style="color:#ffc107">Tip:</span> Element combos unlock powerful augments. Experiment!
      </div>
    `;
    wrapper.appendChild(howTo);

    // CSS animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes pulse { 0%,100% { box-shadow: 0 0 10px #00ff88; } 50% { box-shadow: 0 0 25px #00ff88, 0 0 50px #00ff88; } }
      @keyframes revealCode { from { opacity:0; letter-spacing:12px; } to { opacity:1; letter-spacing:3px; } }
    `;
    wrapper.appendChild(style);

    container.appendChild(wrapper);
    this.domElements.push(wrapper);
  }

  private labeledField(label: string, input: HTMLInputElement): HTMLDivElement {
    const div = document.createElement('div');
    div.style.cssText = 'display: flex; flex-direction: column; gap: 4px; width: 100%;';
    const lbl = document.createElement('div');
    lbl.textContent = label;
    lbl.style.cssText = 'font-size: 11px; color: #556; font-weight: 700; letter-spacing: 2px;';
    div.appendChild(lbl);
    div.appendChild(input);
    return div;
  }

  private styledInput(placeholder: string, width: number): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.style.cssText = `
      width: ${width}px; max-width: 100%; background: #0d1117; color: #e0e8ff;
      border: 1px solid rgba(0,212,255,0.4); padding: 10px 14px; border-radius: 8px;
      font-size: 15px; font-family: inherit; outline: none; transition: box-shadow 0.2s;
      box-sizing: border-box;
    `;
    input.addEventListener('focus', () => { input.style.boxShadow = '0 0 10px #00d4ff'; input.style.borderColor = '#00d4ff'; });
    input.addEventListener('blur', () => { input.style.boxShadow = 'none'; input.style.borderColor = 'rgba(0,212,255,0.4)'; });
    return input;
  }

  private styledButton(text: string, color: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      background: ${color}22; color: ${color}; border: 1px solid ${color};
      padding: 8px 18px; border-radius: 8px; font-size: 14px; font-weight: 700;
      cursor: pointer; transition: all 0.15s; font-family: inherit;
    `;
    btn.addEventListener('mouseenter', () => { btn.style.background = `${color}44`; });
    btn.addEventListener('mouseleave', () => { btn.style.background = `${color}22`; });
    btn.addEventListener('click', onClick);
    return btn;
  }

  private typeText(el: HTMLElement, text: string, speed: number) {
    let i = 0;
    const interval = setInterval(() => {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) clearInterval(interval);
    }, speed);
  }

  private buildConfigSliders() {
    const heading = document.createElement('div');
    heading.textContent = '⚙️ SETTINGS';
    heading.style.cssText = 'font-weight:700;color:#7a8aaa;letter-spacing:2px;font-size:12px;margin-bottom:10px;';
    this.configSection.appendChild(heading);

    const settings: { key: keyof GameConfig; label: string; min: number; max: number; step: number }[] = [
      { key: 'startingCredits', label: '💰 Credits', min: 0, max: 2000, step: 50 },
      { key: 'startingHp', label: '❤️ HP', min: 1, max: 500, step: 10 },
    ];

    this.configSliders = [];

    settings.forEach(s => {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom: 10px;';

      const labelRow = document.createElement('div');
      labelRow.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:3px;';

      const label = document.createElement('span');
      label.textContent = s.label;
      label.style.fontSize = '12px';

      const valueLabel = document.createElement('span');
      valueLabel.style.cssText = 'color:#ffc107;font-weight:bold;font-size:12px;';
      valueLabel.textContent = String(this.config[s.key]);

      labelRow.appendChild(label);
      labelRow.appendChild(valueLabel);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(s.min);
      input.max = String(s.max);
      input.step = String(s.step);
      input.value = String(this.config[s.key]);
      input.style.cssText = 'width:100%;accent-color:#00d4ff;';

      input.addEventListener('input', () => {
        valueLabel.textContent = input.value;
        if (this.isHost) {
          socket.send({ type: 'SET_CONFIG', config: { [s.key]: Number(input.value) } });
        }
      });

      row.appendChild(labelRow);
      row.appendChild(input);
      this.configSection.appendChild(row);

      this.configSliders.push({ key: s.key, input, valueLabel });
    });

    const note = document.createElement('div');
    note.className = 'host-note';
    note.style.cssText = 'font-size:10px;color:#556;margin-top:6px;text-align:center;';
    note.textContent = 'Only the commander can change settings';
    this.configSection.appendChild(note);
  }

  // ── Logic ──────────────────────────────────────────

  private handleMsg(msg: ServerMsg) {
    if (!this.scene.isActive('LobbyScene')) return;

    switch (msg.type) {
      case 'YOUR_ID':
        this.myId = msg.id;
        break;
      case 'LOBBY_UPDATE':
        this.currentRoomCode = msg.roomCode;
        this.isHost = msg.isHost;
        this.config = msg.config;
        this.players = msg.players;
        this.showRoomView(msg.roomCode, msg.players);
        this.updateConfigPanel();
        break;
      case 'GAME_START':
        this.cleanupDOM();
        this.scene.start('GameScene', { state: msg.state, mapDef: msg.mapDef, myId: this.myId });
        break;
      case 'ERROR':
        this.setStatus('error', `❌ ${msg.message}`);
        break;
    }
  }

  private showRoomView(roomCode: string, players: LobbyPlayer[]) {
    this.joinSection.style.display = 'none';
    this.roomSection.style.display = 'flex';

    // Room code
    const codeEl = this.roomSection.querySelector('#room-code-display') as HTMLInputElement;
    if (codeEl && codeEl.value !== roomCode) {
      codeEl.value = roomCode;
      codeEl.style.animation = 'revealCode 0.5s ease';
    }

    // Join URL
    const urlEl = this.roomSection.querySelector('#join-url') as HTMLDivElement;
    if (urlEl) {
      const base = window.location.origin + window.location.pathname;
      urlEl.textContent = `Share: ${base}?room=${roomCode}`;
    }

    // Player cards with color pickers (Feature 3)
    // Remove old cards (keep the title)
    while (this.playerList.children.length > 1) this.playerList.removeChild(this.playerList.lastChild!);

    for (let i = 0; i < 4; i++) {
      const card = document.createElement('div');
      if (i < players.length) {
        const p = players[i];
        const playerColor = p.color || PLAYER_COLORS[i] as PlayerColor;
        const colorHex = PLAYER_COLOR_HEX[playerColor];
        
        card.style.cssText = `
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 12px; border-radius: 8px; border-left: 3px solid ${colorHex};
          background: rgba(255,255,255,0.03); animation: fadeSlideIn 0.3s ease;
          animation-delay: ${i * 0.08}s; animation-fill-mode: both;
        `;
        
        // Left side: name + color picker
        const leftDiv = document.createElement('div');
        leftDiv.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        
        const name = document.createElement('span');
        name.textContent = p.name;
        name.style.cssText = `color: ${colorHex}; font-weight: 600; font-size: 14px;`;
        leftDiv.appendChild(name);
        
        // Feature 3: Color picker swatches
        if (p.id === this.myId) {
          const colorPicker = document.createElement('div');
          colorPicker.style.cssText = 'display: flex; gap: 3px;';
          
          PLAYER_COLORS.forEach((color) => {
            const swatch = document.createElement('div');
            const isSelected = playerColor === color;
            const isAvailable = !players.some(op => op.color === color && op.id !== p.id);
            const swatchColor = PLAYER_COLOR_HEX[color];
            
            swatch.style.cssText = `
              width: 16px; height: 16px; border-radius: 3px; cursor: pointer;
              background: ${swatchColor}; border: 2px solid ${isSelected ? '#fff' : 'transparent'};
              opacity: ${isAvailable ? '1' : '0.3'}; transition: all 0.2s;
            `;
            
            if (isAvailable) {
              swatch.addEventListener('click', () => {
                socket.send({ type: 'SET_COLOR', color });
              });
              swatch.addEventListener('mouseenter', () => {
                swatch.style.transform = 'scale(1.2)';
              });
              swatch.addEventListener('mouseleave', () => {
                swatch.style.transform = 'scale(1)';
              });
            }
            
            colorPicker.appendChild(swatch);
          });
          
          leftDiv.appendChild(colorPicker);
        }
        
        const badge = document.createElement('span');
        badge.textContent = p.ready ? '✅ Ready' : '⏳ Waiting';
        badge.style.cssText = `font-size: 12px; color: ${p.ready ? '#00ff88' : '#888'};`;
        
        card.appendChild(leftDiv);
        card.appendChild(badge);
      } else {
        card.style.cssText = 'padding: 8px 12px; color: #333; font-size: 13px;';
        card.textContent = '— empty slot —';
      }
      this.playerList.appendChild(card);
    }

    // Pulse launch button when all ready
    const allReady = players.length > 0 && players.every(p => p.ready);
    if (allReady) {
      this.launchBtn.style.animation = 'pulse 1.5s infinite';
      this.launchBtn.style.background = 'linear-gradient(135deg, #00ff88, #00aa55)';
      this.launchBtn.textContent = '🚀 LAUNCH GAME';
    } else {
      this.launchBtn.style.animation = 'none';
      this.launchBtn.style.background = 'linear-gradient(135deg, #00d4ff, #0088aa)';
      this.launchBtn.textContent = '🚀 READY UP';
    }

    this.setStatus('ok', `${players.length}/4 players${this.isHost ? '  👑 You are commander' : ''}`);
  }

  private updateConfigPanel() {
    this.configSliders.forEach(s => {
      s.input.value = String(this.config[s.key]);
      s.valueLabel.textContent = String(this.config[s.key]);
      s.input.disabled = !this.isHost;
      s.input.style.opacity = this.isHost ? '1' : '0.5';
    });

    const note = this.configSection.querySelector('.host-note') as HTMLElement;
    if (note) {
      note.textContent = this.isHost ? '👑 You are the commander' : 'Only the commander can change settings';
      note.style.color = this.isHost ? '#ffc107' : '#556';
    }
  }

  private setStatus(type: 'ok' | 'error' | 'connecting', text: string) {
    if (!this.statusEl) return;
    const colors = { ok: '#00ff88', error: '#ff6b6b', connecting: '#00d4ff' };
    this.statusEl.textContent = text;
    this.statusEl.style.color = colors[type];
  }

  private joinLobby() {
    const name = this.nameInput.value.trim() || 'Player';
    localStorage.setItem('ect_playerName', name);
    const code = this.codeInput.value.trim() || undefined;
    socket.send({ type: 'JOIN_LOBBY', name, roomCode: code });
  }

  private quickPlay() {
    const name = COMMANDER_NAMES[Math.floor(Math.random() * COMMANDER_NAMES.length)] + Math.floor(Math.random() * 100);
    this.nameInput.value = name;
    localStorage.setItem('ect_playerName', name);
    socket.send({ type: 'JOIN_LOBBY', name, roomCode: undefined });
  }

  private toggleReady() {
    socket.send({ type: 'READY' });
  }

  private copyRoomCode() {
    navigator.clipboard.writeText(this.currentRoomCode).then(() => {
      const btn = this.roomSection.querySelector('#copy-room-btn') as HTMLButtonElement;
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✅ Copied!';
        btn.style.color = '#00ff88';
        btn.style.borderColor = '#00ff88';
        setTimeout(() => { btn.textContent = orig; btn.style.color = '#00d4ff'; btn.style.borderColor = '#00d4ff'; }, 2000);
      }
    });
  }

  private cleanupDOM() {
    this.domElements.forEach((el) => el.remove());
    this.domElements = [];
    this.wrapper = null;
    this.configSliders = [];
  }

  shutdown() {
    this.cleanupDOM();
  }
}
