import type { GameState, PlayerState, TowerTier } from '@ect/shared';
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
      // Refund based on tier: T1=1x, T2=3x (used 1+2 copies), T3=9x
      const copies = tower.stars >= 3 ? 9 : tower.stars >= 2 ? 3 : 1;
      const totalCost = def.cost * copies;
      player.gold += Math.floor(totalCost * SELL_REFUND_RATIO);
    }

    this.updateCanUpgrade(player);
    return true;
  }

  /** Reroll the shop */
  reroll(player: PlayerState): boolean {
    if (player.gold < REROLL_COST) return false;
    player.gold -= REROLL_COST;
    player.shop = this.generateShop(player);
    this.updateCanUpgrade(player);
    return true;
  }

  /** Try to auto-fuse: if player has 3 towers of same type+stars on the board, merge into starred version (legacy) */
  tryFusion(player: PlayerState, _defId: string): boolean {
    // Legacy fusion removed — now using explicit upgrade system
    this.updateCanUpgrade(player);
    return false;
  }

  /**
   * Upgrade a tower.
   * T1→T2: Need 2 copies of same tower type in shop. Consume them, tower becomes T2.
   * T2→T3: Need another T2 of same type on field. Consume it, tower becomes T3.
   * Returns true if upgrade succeeded.
   */
  upgradeTower(player: PlayerState, towerId: string): boolean {
    const tower = player.towers.find(t => t.instanceId === towerId);
    if (!tower) return false;
    const def = TOWER_MAP[tower.defId];
    if (!def) return false;

    if (tower.stars === 1) {
      // T1 → T2: need 2 copies in shop
      const shopMatches: number[] = [];
      for (let i = 0; i < player.shop.length; i++) {
        if (player.shop[i] === tower.defId) shopMatches.push(i);
      }
      if (shopMatches.length < 2) return false;

      // Consume 2 shop slots
      player.shop[shopMatches[0]] = null;
      player.shop[shopMatches[1]] = null;
      tower.stars = 2 as TowerTier;

      this.updateCanUpgrade(player);
      return true;
    } else if (tower.stars === 2) {
      // T2 → T3: need another T2 of same type on field
      const otherT2 = player.towers.find(t =>
        t.instanceId !== towerId && t.defId === tower.defId && t.stars === 2
      );
      if (!otherT2) return false;

      // Remove the other T2
      const idx = player.towers.indexOf(otherT2);
      if (idx >= 0) player.towers.splice(idx, 1);
      tower.stars = 3 as TowerTier;

      this.updateCanUpgrade(player);
      return true;
    }

    return false;
  }

  /** Check and set canUpgrade for all towers of a player */
  updateCanUpgrade(player: PlayerState) {
    // Count shop copies per defId
    const shopCounts: Record<string, number> = {};
    for (const slot of player.shop) {
      if (slot) shopCounts[slot] = (shopCounts[slot] || 0) + 1;
    }

    // Count T2 towers on field per defId
    const fieldT2Counts: Record<string, number> = {};
    for (const t of player.towers) {
      if (t.stars === 2) fieldT2Counts[t.defId] = (fieldT2Counts[t.defId] || 0) + 1;
    }

    for (const tower of player.towers) {
      if (tower.stars === 1) {
        // T1→T2: need 2+ in shop
        tower.canUpgrade = (shopCounts[tower.defId] || 0) >= 2;
      } else if (tower.stars === 2) {
        // T2→T3: need 2+ T2 of same type on field
        tower.canUpgrade = (fieldT2Counts[tower.defId] || 0) >= 2;
      } else {
        tower.canUpgrade = false;
      }
    }
  }
}
