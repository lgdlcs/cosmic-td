import Phaser from 'phaser';
import { socket } from '../network/socket';
import type { ServerMsg, LobbyPlayer, GameConfig } from '@ect/shared';
import { DEFAULT_GAME_CONFIG } from '@ect/shared';

export class LobbyScene extends Phaser.Scene {
  private nameInput!: HTMLInputElement;
  private codeInput!: HTMLInputElement;
  private playerTexts: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private roomCodeText!: Phaser.GameObjects.Text;
  private myId: string = '';
  private isHost: boolean = false;
  private config: GameConfig = { ...DEFAULT_GAME_CONFIG };
  private domElements: HTMLElement[] = [];
  private configContainer: HTMLDivElement | null = null;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  init(data?: { forceReconnect?: boolean }) {
    this.data.set('forceReconnect', data?.forceReconnect || false);
  }

  create() {
    const cx = this.cameras.main.centerX;

    // Title
    this.add.text(cx, 60, '⚔️ Element Chess TD', {
      fontSize: '36px',
      color: '#FFD93D',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, 110, 'Auto-Chess × Tower Defense', {
      fontSize: '16px',
      color: '#888',
    }).setOrigin(0.5);

    // Name input
    this.add.text(cx - 120, 180, 'Your name:', { fontSize: '16px', color: '#ccc' });
    this.nameInput = this.createInput(cx + 20, 175, 'Enter name...', 160);
    const savedName = localStorage.getItem('ect_playerName');
    if (savedName) this.nameInput.value = savedName;

    // Room code
    this.add.text(cx - 120, 230, 'Room code:', { fontSize: '16px', color: '#ccc' });
    this.codeInput = this.createInput(cx + 20, 225, 'Leave empty to create', 160);

    // Buttons
    this.createButton(cx - 80, 290, 'Join / Create', () => this.joinLobby());
    this.createButton(cx + 80, 290, 'Ready', () => this.toggleReady());

    // Room code display
    this.roomCodeText = this.add.text(cx, 350, '', {
      fontSize: '24px',
      color: '#4EA8DE',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Player list
    this.statusText = this.add.text(cx, 390, 'Enter a name and join', {
      fontSize: '14px',
      color: '#888',
    }).setOrigin(0.5);

    for (let i = 0; i < 4; i++) {
      this.playerTexts.push(
        this.add.text(cx - 100, 420 + i * 35, '', {
          fontSize: '18px',
          color: '#eee',
        })
      );
    }

    // Config panel placeholder (created after joining)
    this.createConfigPanel();

    // Connect
    socket.clearHandlers();
    const handler = (msg: ServerMsg) => this.handleMsg(msg);

    this.statusText.setText('🔄 Connecting...').setColor('#4EA8DE');
    socket.reconnect().then(() => {
      socket.onMessage(handler);
      this.statusText.setText('✅ Connected - Enter name and join').setColor('#4AD97A');
    }).catch(() => {
      this.statusText.setText('❌ Cannot connect to server').setColor('#ff6b6b');
    });
  }

  private handleMsg(msg: ServerMsg) {
    if (!this.scene.isActive('LobbyScene')) return;

    switch (msg.type) {
      case 'YOUR_ID':
        this.myId = msg.id;
        break;
      case 'LOBBY_UPDATE':
        this.roomCodeText.setText(`Room: ${msg.roomCode}`);
        this.isHost = msg.isHost;
        this.config = msg.config;
        this.updatePlayerList(msg.players);
        this.updateConfigPanel();
        break;
      case 'GAME_START':
        this.cleanupDOM();
        this.scene.start('GameScene', { state: msg.state, mapDef: msg.mapDef, myId: this.myId });
        break;
      case 'ERROR':
        this.statusText.setText(`❌ ${msg.message}`).setColor('#ff6b6b');
        break;
    }
  }

  private updatePlayerList(players: LobbyPlayer[]) {
    this.statusText.setText(`${players.length}/4 players${this.isHost ? '  👑 You are host' : ''}`).setColor('#888');
    const colors = ['#4A90D9', '#D94A4A', '#4AD97A', '#D9A04A'];
    for (let i = 0; i < 4; i++) {
      if (i < players.length) {
        const p = players[i];
        const ready = p.ready ? ' ✅' : ' ⏳';
        this.playerTexts[i].setText(`${p.name}${ready}`).setColor(colors[i]);
      } else {
        this.playerTexts[i].setText('—  waiting...').setColor('#444');
      }
    }
  }

  // ── Config Panel ──────────────────────────────────────

  private configSliders: { key: keyof GameConfig; input: HTMLInputElement; valueLabel: HTMLSpanElement }[] = [];

  private createConfigPanel() {
    const container = document.getElementById('game-container')!;
    const panel = document.createElement('div');
    panel.style.cssText = `
      position: absolute; right: 20px; top: 180px; width: 220px;
      background: rgba(15,52,96,0.95); border: 1px solid #4EA8DE; border-radius: 8px;
      padding: 14px; font-family: inherit; color: #eee; font-size: 13px;
      display: none; z-index: 10;
    `;

    panel.innerHTML = '<div style="font-weight:bold;color:#FFD93D;margin-bottom:10px;font-size:14px">⚙️ Game Settings</div>';

    const settings: { key: keyof GameConfig; label: string; min: number; max: number; step: number }[] = [
      { key: 'startingGold', label: '💰 Starting Gold', min: 0, max: 500, step: 10 },
      { key: 'startingHp', label: '❤️ Starting HP', min: 1, max: 500, step: 10 },
      { key: 'fragmentPoolSize', label: '🔮 Fragments / element', min: 1, max: 50, step: 1 },
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
      valueLabel.style.cssText = 'color:#FFD93D;font-weight:bold;font-size:12px;';
      valueLabel.textContent = String(this.config[s.key]);

      labelRow.appendChild(label);
      labelRow.appendChild(valueLabel);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(s.min);
      input.max = String(s.max);
      input.step = String(s.step);
      input.value = String(this.config[s.key]);
      input.style.cssText = 'width:100%;accent-color:#FFD93D;';

      input.addEventListener('input', () => {
        valueLabel.textContent = input.value;
        if (this.isHost) {
          socket.send({ type: 'SET_CONFIG', config: { [s.key]: Number(input.value) } });
        }
      });

      row.appendChild(labelRow);
      row.appendChild(input);
      panel.appendChild(row);

      this.configSliders.push({ key: s.key, input, valueLabel });
    });

    // Host-only note
    const note = document.createElement('div');
    note.style.cssText = 'font-size:10px;color:#888;margin-top:6px;text-align:center;';
    note.className = 'host-note';
    note.textContent = 'Only the host can change settings';
    panel.appendChild(note);

    container.appendChild(panel);
    this.configContainer = panel;
    this.domElements.push(panel);
  }

  private updateConfigPanel() {
    if (!this.configContainer) return;

    // Show panel once in a room
    this.configContainer.style.display = 'block';

    // Update slider values from server config
    this.configSliders.forEach(s => {
      s.input.value = String(this.config[s.key]);
      s.valueLabel.textContent = String(this.config[s.key]);
      s.input.disabled = !this.isHost;
      s.input.style.opacity = this.isHost ? '1' : '0.5';
    });

    const note = this.configContainer.querySelector('.host-note') as HTMLElement;
    if (note) {
      note.textContent = this.isHost ? '👑 You are the host' : 'Only the host can change settings';
      note.style.color = this.isHost ? '#FFD93D' : '#888';
    }
  }

  // ── Helpers ───────────────────────────────────────────

  private joinLobby() {
    const name = this.nameInput.value.trim() || 'Player';
    localStorage.setItem('ect_playerName', name);
    const code = this.codeInput.value.trim() || undefined;
    socket.send({ type: 'JOIN_LOBBY', name, roomCode: code });
  }

  private toggleReady() {
    socket.send({ type: 'READY' });
  }

  private createInput(x: number, y: number, placeholder: string, width: number): HTMLInputElement {
    const container = document.getElementById('game-container')!;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.style.cssText = `
      position: absolute; left: ${x}px; top: ${y}px; width: ${width}px;
      background: #0f3460; color: #eee; border: 1px solid #4EA8DE;
      padding: 6px 10px; border-radius: 4px; font-size: 14px;
      font-family: inherit; outline: none; z-index: 10;
    `;
    container.appendChild(input);
    this.domElements.push(input);
    return input;
  }

  private createButton(x: number, y: number, label: string, onClick: () => void) {
    this.add.text(x, y, label, {
      fontSize: '16px',
      color: '#1a1a2e',
      backgroundColor: '#FFD93D',
      padding: { x: 14, y: 8 },
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', (function(this: Phaser.GameObjects.Text) { this.setStyle({ color: '#000' }); }))
      .on('pointerout', (function(this: Phaser.GameObjects.Text) { this.setStyle({ color: '#1a1a2e' }); }))
      .on('pointerdown', onClick);
  }

  private cleanupDOM() {
    this.domElements.forEach((el) => el.remove());
    this.domElements = [];
    this.configContainer = null;
    this.configSliders = [];
  }

  shutdown() {
    this.cleanupDOM();
  }
}
