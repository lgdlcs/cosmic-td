import Phaser from 'phaser';
import { socket } from '../network/socket';
import type { PlayerState } from '@ect/shared';
import { PLAYER_COLOR_HEX } from '@ect/shared';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: { winnerId: string; players: PlayerState[] }) {
    this.data.set('winnerId', data.winnerId);
    this.data.set('players', data.players);
  }

  create() {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    const winnerId = this.data.get('winnerId') as string;
    const players = this.data.get('players') as PlayerState[];
    const winner = players.find((p) => p.id === winnerId);

    this.add.text(cx, cy - 100, '🏆 GAME OVER', {
      fontSize: '48px', color: '#FFD93D', fontStyle: 'bold',
    }).setOrigin(0.5);

    if (winner) {
      this.add.text(cx, cy - 30, `${winner.name} wins!`, {
        fontSize: '32px', color: PLAYER_COLOR_HEX[winner.color],
      }).setOrigin(0.5);
    }

    const sorted = [...players].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.hp - a.hp;
    });

    sorted.forEach((p, i) => {
      const status = p.alive ? `❤️ ${p.hp} HP` : '💀';
      this.add.text(cx, cy + 30 + i * 35, `${i + 1}. ${p.name} — ${status}`, {
        fontSize: '20px', color: PLAYER_COLOR_HEX[p.color],
      }).setOrigin(0.5);
    });

    this.add.text(cx, cy + 200, '🔄 Play Again', {
      fontSize: '20px', color: '#1a1a2e', backgroundColor: '#FFD93D',
      padding: { x: 20, y: 10 },
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        // Need fresh connection for new game
        socket.clearHandlers();
        this.scene.start('LobbyScene');
      });
  }
}
