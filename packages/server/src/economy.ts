import type { PlayerState } from '@ect/shared';
import { BASE_INCOME, KILL_REWARD, BOSS_KILL_REWARD } from '@ect/shared';

export class EconomyManager {
  /** End-of-round income: base + PvP bonus */
  endOfRoundIncome(player: PlayerState) {
    const income = player.income; // base + pvp bonus already tracked
    player.credits += income;
  }

  /** Reward for killing a regular mob */
  mobKillReward(): number {
    return KILL_REWARD;
  }

  /** Reward for killing boss */
  bossKillReward(): number {
    return BOSS_KILL_REWARD;
  }
}
