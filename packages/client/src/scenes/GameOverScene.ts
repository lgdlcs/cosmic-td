import Phaser from 'phaser';
import { socket } from '../network/socket';
import type { PlayerState } from '@ect/shared';

const FONT = "'Chakra Petch', 'Segoe UI', system-ui, sans-serif";
import { PLAYER_COLOR_HEX } from '@ect/shared';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: { winnerId: string; players: PlayerState[]; myId: string }) {
    this.data.set('winnerId', data.winnerId);
    this.data.set('players', data.players);
    this.data.set('myId', data.myId);
  }

  create() {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    const winnerId = this.data.get('winnerId') as string;
    const players = this.data.get('players') as PlayerState[];
    const myId = this.data.get('myId') as string;
    const winner = players.find((p) => p.id === winnerId);
    const isMe = winnerId === myId;

    // Title
    this.add.text(cx, cy - 120, isMe ? '🏆 VICTORY!' : '💀 DEFEAT', {
      fontFamily: FONT, fontSize: '48px',
      color: isMe ? '#00d4ff' : '#ff4444',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Winner announcement
    if (winner) {
      const msg = isMe ? 'You won!' : `${winner.name} wins!`;
      this.add.text(cx, cy - 60, msg, {
        fontFamily: FONT, fontSize: '28px',
        color: PLAYER_COLOR_HEX[winner.color],
      }).setOrigin(0.5);
    }

    // Leaderboard
    const sorted = [...players].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.hp - a.hp;
    });

    sorted.forEach((p, i) => {
      const status = p.alive ? `❤️ ${p.hp} HP` : '💀';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
      const isMyLine = p.id === myId;
      this.add.text(cx, cy + 10 + i * 35, `${medal} ${p.name} — ${status}`, {
        fontFamily: FONT, fontSize: '20px',
        color: PLAYER_COLOR_HEX[p.color],
        fontStyle: isMyLine ? 'bold' : 'normal',
      }).setOrigin(0.5);
    });

    // Play Again button
    this.add.text(cx, cy + 200, '🔄 Play Again', {
      fontFamily: FONT, fontSize: '20px',
      color: '#0a0a14',
      backgroundColor: '#00d4ff',
      padding: { x: 20, y: 10 },
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        socket.clearHandlers();
        this.scene.start('LobbyScene', { forceReconnect: true });
      });
  }
}
