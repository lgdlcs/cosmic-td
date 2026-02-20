import type { GameState, PlayerState, Element } from '@ect/shared';
import {
  SHOP_SLOTS,
  REROLL_COST,
  SELL_REFUND_RATIO,
  BASE_TOWER_COSTS,
  SHOP_FRAGMENT_CHANCE,
  SHOP_TOWER_CHANCE,
  FRAGMENT_POOL_SIZE,
  ELEMENTS,
  BASE_TOWERS,
  getFragmentCost,
  TOWER_MAP,
} from '@ect/shared';

export class ShopManager {
  state: GameState;
  fragmentPool: Map<Element, number>; // shared pool of fragments

  constructor(state: GameState) {
    this.state = state;
    // Initialize fragment pool: 12 fragments per element
    this.fragmentPool = new Map();
    for (const element of ELEMENTS) {
      this.fragmentPool.set(element, FRAGMENT_POOL_SIZE);
    }
  }

  /** Generate 5 shop slots for a player - base towers + fragments */
  generateShop(player: PlayerState): (string | null)[] {
    const shop: (string | null)[] = [];

    for (let i = 0; i < SHOP_SLOTS; i++) {
      if (Math.random() < SHOP_FRAGMENT_CHANCE) {
        // Try to generate a fragment
        // Get elements that are still available in pool
        const availableElements = ELEMENTS.filter(e => (this.fragmentPool.get(e) || 0) > 0);
        
        if (availableElements.length > 0) {
          // Pick random available element
          const randomElement = availableElements[Math.floor(Math.random() * availableElements.length)];
          // Store fragment as: "fragment:<element>"
          shop.push(`fragment:${randomElement}`);
        } else {
          // No fragments available, fall back to base tower
          const randomTower = BASE_TOWERS[Math.floor(Math.random() * BASE_TOWERS.length)];
          shop.push(randomTower.id);
        }
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

  /** Buy fragment from shop */
  buyFragment(player: PlayerState, shopIndex: number): boolean {
    if (shopIndex < 0 || shopIndex >= SHOP_SLOTS) return false;
    const itemId = player.shop[shopIndex];
    if (!itemId || !this.isFragment(itemId)) return false;

    const element = this.getFragmentElement(itemId);
    if (!element) return false;

    // Check if fragment is still available in pool
    const available = this.fragmentPool.get(element) || 0;
    if (available <= 0) return false;

    // Calculate cost based on player's totalBought
    const cost = getFragmentCost(element, player.totalBought[element]);
    if (player.gold < cost) return false;

    // Execute purchase
    player.gold -= cost;
    player.fragments[element]++;
    player.totalBought[element]++;
    this.fragmentPool.set(element, available - 1);
    player.shop[shopIndex] = null;

    return true;
  }

  /** Check if a shop item is a fragment */
  isFragment(itemId: string | null): boolean {
    if (!itemId) return false;
    return itemId.startsWith('fragment:');
  }

  /** Get element from fragment ID */
  getFragmentElement(itemId: string): Element | null {
    if (!this.isFragment(itemId)) return null;
    const element = itemId.replace('fragment:', '') as Element;
    return ELEMENTS.includes(element) ? element : null;
  }

  /** Get fragment cost for display in shop */
  getFragmentCost(element: Element, player: PlayerState): number {
    return getFragmentCost(element, player.totalBought[element]);
  }
}