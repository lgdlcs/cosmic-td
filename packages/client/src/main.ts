import Phaser from 'phaser';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 960,
  height: 720,
  backgroundColor: '#0a0a14',
  scene: [LobbyScene, GameScene, GameOverScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  pixelArt: false,
  antialias: true,
};

const game = new Phaser.Game(config);

// Disable browser context menu on the game canvas
document.getElementById('game-container')?.addEventListener('contextmenu', (e) => e.preventDefault());
