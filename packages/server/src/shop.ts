import type { GameState, PlayerState, Element } from '@ect/shared';
import {
  SHOP_SLOTS,
  REROLL_COST,
  SELL_REFUND_RATIO,
  BASE_TOWER_COSTS,
  CRYSTAL_SHOP_CHANCE,
  CRYSTAL_COST,
  ELEMENTS,
  BASE_TOWERS,
  ELEMENT_CRYSTALS,
  TOWER_MAP,
} from '@ect/shared';

export class ShopManager {
  state: GameState;

  constructor(state: GameState) {
    this.state = state;
  }

  /** Generate 5 shop slots for a player - base towers + crystals */
  generateShop(player: PlayerState): (string | null)[] {
    const shop: (string | null)[] = [];

    for (let i = 0; i < SHOP_SLOTS; i++) {
      if (Math.random() < CRYSTAL_SHOP_CHANCE) {
        // Generate element crystal
        const randomElement = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
        const crystal = ELEMENT_CRYSTALS.find(c => c.element === randomElement);
        shop.push(crystal ? crystal.id : null);
      } else {
        // Generate base tower
        const randomTower = BASE_TOWERS[Math.floor(Math.random() * BASE_TOWERS.length)];
        shop.push(randomTower.id);
      }
    }

    return shop;
  }

  /** Sell a placed tower — return to pool + refund */
  sellTower(player: PlayerState, instanceId: string): boolean {
    // Only check placed towers (no more bench)
    const towerIdx = player.towers.findIndex((t) => t.instanceId === instanceId);
    if (towerIdx < 0) return false;

    const tower = player.towers[towerIdx];
    player.towers.splice(towerIdx, 1);

    const def = TOWER_MAP[tower.defId];
    if (def) {
      // Calculate refund: base cost + upgrade costs
      let refund = def.cost;
      
      // Add upgrade costs for applied elements
      if (tower.appliedElements.length >= 1) {
        refund += 3; // T1 upgrade cost
      }
      if (tower.appliedElements.length >= 2) {
        refund += 5; // T2 upgrade cost
      }
      
      player.gold += Math.floor(refund * SELL_REFUND_RATIO);
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

  /** Buy element crystal and add point to that element */
  buyCrystal(player: PlayerState, shopIndex: number): boolean {
    if (shopIndex < 0 || shopIndex >= SHOP_SLOTS) return false;
    const crystalId = player.shop[shopIndex];
    if (!crystalId) return false;

    const crystal = ELEMENT_CRYSTALS.find(c => c.id === crystalId);
    if (!crystal) return false;

    if (player.gold < crystal.cost) return false;
    if (player.elementPoints[crystal.element] >= 3) return false; // Max 3 points per element

    player.gold -= crystal.cost;
    player.elementPoints[crystal.element]++;
    player.shop[shopIndex] = null;

    return true;
  }

  /** Check if a shop item is a crystal */
  isCrystal(itemId: string | null): boolean {
    if (!itemId) return false;
    return ELEMENT_CRYSTALS.some(c => c.id === itemId);
  }

  /** Get crystal info for a shop item */
  getCrystal(itemId: string) {
    return ELEMENT_CRYSTALS.find(c => c.id === itemId);
  }
}