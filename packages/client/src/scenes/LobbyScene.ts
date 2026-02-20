import Phaser from 'phaser';
import { socket } from '../network/socket';
import type { ServerMsg, LobbyPlayer } from '@ect/shared';

export class LobbyScene extends Phaser.Scene {
  private nameInput!: HTMLInputElement;
  private codeInput!: HTMLInputElement;
  private playerTexts: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private roomCodeText!: Phaser.GameObjects.Text;
  private myId: string = '';
  private domElements: HTMLElement[] = [];

  constructor() {
    super({ key: 'LobbyScene' });
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
    // Restore from localStorage
    const savedName = localStorage.getItem('ect_playerName');
    if (savedName) this.nameInput.value = savedName;

    // Room code
    this.add.text(cx - 120, 230, 'Room code:', { fontSize: '16px', color: '#ccc' });
    this.codeInput = this.createInput(cx + 20, 225, 'Leave empty to create', 160);

    // Buttons
    this.createButton(cx - 100, 290, 'Join / Create', () => this.joinLobby());
    this.createButton(cx + 10, 290, 'Ready', () => this.toggleReady());
    // Dev: auto join + ready in one click
    this.createButton(cx + 120, 290, '▶ DEV', () => {
      this.joinLobby();
      setTimeout(() => socket.send({ type: 'READY' }), 300);
    });

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

    // Always fresh connection when entering lobby
    socket.clearHandlers();
    const handler = (msg: ServerMsg) => this.handleMsg(msg);
    socket.reconnect().then(() => {
      socket.onMessage(handler);
    }).catch((e) => {
      console.error('Failed to connect', e);
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
        this.updatePlayerList(msg.players);
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
    this.statusText.setText(`${players.length}/4 players`).setColor('#888');
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
  }

  shutdown() {
    this.cleanupDOM();
  }
}
