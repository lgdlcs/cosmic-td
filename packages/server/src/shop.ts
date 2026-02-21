import type { GameState, PlayerState } from '@ect/shared';
import {
  SHOP_SLOTS,
  REROLL_COST,
  SELL_REFUND_RATIO,
  TOWER_COSTS,
  TOWER_DEFS,
  TOWER_MAP,
} from '@ect/shared';

export class ShopManager {
  state: GameState;

  constructor(state: GameState) {
    this.state = state;
  }

  /** Generate 5 shop slots — equal odds among 4 tower types */
  generateShop(_player: PlayerState): (string | null)[] {
    const shop: (string | null)[] = [];
    for (let i = 0; i < SHOP_SLOTS; i++) {
      const randomTower = TOWER_DEFS[Math.floor(Math.random() * TOWER_DEFS.length)];
      shop.push(randomTower.id);
    }
    return shop;
  }

  /** Sell a placed tower — refund gold */
  sellTower(player: PlayerState, instanceId: string): boolean {
    const towerIdx = player.towers.findIndex((t) => t.instanceId === instanceId);
    if (towerIdx < 0) return false;

    const tower = player.towers[towerIdx];
    player.towers.splice(towerIdx, 1);

    const def = TOWER_MAP[tower.defId];
    if (def) {
      // Star towers cost 3x the base (3 copies merged)
      const totalCost = tower.stars >= 1 ? def.cost * 3 : def.cost;
      player.gold += Math.floor(totalCost * SELL_REFUND_RATIO);
    }

    return true;
  }

  /** Reroll the shop */
  reroll(player: PlayerState): boolean {
    if (player.gold < REROLL_COST) return false;
    player.gold -= REROLL_COST;
    player.shop = this.generateShop(player);
    return true;
  }

  /** Try to auto-fuse: if player has 3 towers of same type+stars on the board, merge into starred version */
  tryFusion(player: PlayerState, defId: string): boolean {
    const candidates = player.towers.filter(t => t.defId === defId && t.stars === 0);
    if (candidates.length >= 3) {
      // Remove 2, upgrade 1
      const keeper = candidates[0];
      keeper.stars = 1;
      // Remove the other 2
      for (let i = 1; i <= 2; i++) {
        const idx = player.towers.indexOf(candidates[i]);
        if (idx >= 0) player.towers.splice(idx, 1);
      }
      return true;
    }
    return false;
  }
}
