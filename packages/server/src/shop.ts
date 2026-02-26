import type { PlayerState } from '@ect/shared';
import { PVP_UNIT_MAP } from '@ect/shared';

export class PvPShopManager {
  /**
   * Buy a PvP unit to send to an opponent.
   * Returns true if purchase succeeded.
   * Side effects: deducts credits, increases buyer's income.
   */
  buyUnit(player: PlayerState, unitId: string): boolean {
    const unitDef = PVP_UNIT_MAP[unitId];
    if (!unitDef) return false;
    if (player.credits < unitDef.cost) return false;

    player.credits -= unitDef.cost;
    player.income += unitDef.incomeBonus;
    return true;
  }
}
