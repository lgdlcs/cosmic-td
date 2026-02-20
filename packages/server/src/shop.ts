import type { GameState, PlayerState, TowerTier } from '@ect/shared';
import {
  SHOP_SLOTS,
  SHOP_ODDS,
  POOL_SIZE_T1,
  POOL_SIZE_T2,
  POOL_SIZE_T3,
  REROLL_COST,
  XP_COST,
  XP_PER_PURCHASE,
  TOWER_COST,
  SELL_REFUND_RATIO,
  T1_TOWERS,
  T2_TOWERS,
  TOWER_MAP,
} from '@ect/shared';

export class ShopManager {
  state: GameState;
  pool: Map<string, number>; // towerId → remaining count

  constructor(state: GameState) {
    this.state = state;
    this.pool = new Map();

    // Initialize pool
    T1_TOWERS.forEach((t) => this.pool.set(t.id, POOL_SIZE_T1));
    T2_TOWERS.forEach((t) => this.pool.set(t.id, POOL_SIZE_T2));
    // T3 later
  }

  /** Generate 5 shop slots for a player based on level */
  generateShop(player: PlayerState): (string | null)[] {
    const odds = SHOP_ODDS[player.level] || SHOP_ODDS[1];
    const shop: (string | null)[] = [];

    for (let i = 0; i < SHOP_SLOTS; i++) {
      const roll = Math.random() * 100;
      let tier: TowerTier;

      if (roll < odds[0]) tier = 1;
      else if (roll < odds[0] + odds[1]) tier = 2;
      else tier = 3;

      const towerId = this.pickFromPool(tier);
      shop.push(towerId);
    }

    return shop;
  }

  /** Pick a random tower of the given tier from the pool */
  private pickFromPool(tier: TowerTier): string | null {
    const towers = tier === 1 ? T1_TOWERS : tier === 2 ? T2_TOWERS : [];
    const available = towers.filter((t) => (this.pool.get(t.id) || 0) > 0);

    if (available.length === 0) return null;

    const pick = available[Math.floor(Math.random() * available.length)];
    this.pool.set(pick.id, (this.pool.get(pick.id) || 1) - 1);
    return pick.id;
  }

  /** Buy a tower from shop slot */
  buyTower(player: PlayerState, shopIndex: number): boolean {
    if (shopIndex < 0 || shopIndex >= SHOP_SLOTS) return false;
    const towerId = player.shop[shopIndex];
    if (!towerId) return false;

    const def = TOWER_MAP[towerId];
    if (!def) return false;

    const cost = TOWER_COST[def.tier as keyof typeof TOWER_COST] || 3;
    if (player.gold < cost) return false;
    if (player.bench.length >= 8) return false; // bench full

    player.gold -= cost;
    player.bench.push(towerId);
    player.shop[shopIndex] = null;

    return true;
  }

  /** Sell a tower — return to pool + refund */
  sellTower(player: PlayerState, instanceId: string): boolean {
    // Check bench first
    const benchIdx = player.bench.indexOf(instanceId);
    if (benchIdx >= 0) {
      const defId = player.bench[benchIdx];
      player.bench.splice(benchIdx, 1);
      this.returnToPool(defId);
      const def = TOWER_MAP[defId];
      if (def) {
        player.gold += Math.floor(TOWER_COST[def.tier as keyof typeof TOWER_COST] * SELL_REFUND_RATIO);
      }
      return true;
    }

    // Check placed towers
    const towerIdx = player.towers.findIndex((t) => t.instanceId === instanceId);
    if (towerIdx >= 0) {
      const tower = player.towers[towerIdx];
      player.towers.splice(towerIdx, 1);
      this.returnToPool(tower.defId);
      const def = TOWER_MAP[tower.defId];
      if (def) {
        player.gold += Math.floor(TOWER_COST[def.tier as keyof typeof TOWER_COST] * SELL_REFUND_RATIO);
      }
      return true;
    }

    return false;
  }

  /** Reroll the shop */
  reroll(player: PlayerState): boolean {
    if (player.gold < REROLL_COST) return false;

    // Return current shop towers to pool
    player.shop.forEach((id) => {
      if (id) this.returnToPool(id);
    });

    player.gold -= REROLL_COST;
    player.shop = this.generateShop(player);
    return true;
  }

  /** Level up */
  levelUp(player: PlayerState): boolean {
    if (player.gold < XP_COST) return false;
    if (player.level >= 6) return false;

    player.gold -= XP_COST;
    player.xp += XP_PER_PURCHASE;

    // Check level up
    while (player.level < 6 && player.xp >= player.xpToNext) {
      player.xp -= player.xpToNext;
      player.level++;
      player.xpToNext = player.level < 6
        ? (Object.values(
            // next level XP requirement
            { 2: 4, 3: 8, 4: 12, 5: 16, 6: 24 }
          )[player.level - 1] || 99)
        : 99;
    }

    return true;
  }

  private returnToPool(towerId: string) {
    this.pool.set(towerId, (this.pool.get(towerId) || 0) + 1);
  }
}
