import type { GameState, PlayerState } from '@ect/shared';
import {
  BASE_INCOME,
  INTEREST_PER_10G,
  MAX_INTEREST,
  CLEAN_BONUS,
  STREAK_BONUS,
  KILL_REWARD_TIERS,
} from '@ect/shared';

export class EconomyManager {
  state: GameState;

  constructor(state: GameState) {
    this.state = state;
  }

  /** Calculate and apply end-of-round income */
  endOfRoundIncome(player: PlayerState, cleanRound: boolean) {
    let income = BASE_INCOME;

    // Interest (1 per 10 gold, max 5)
    const interest = Math.min(Math.floor(player.gold / 10) * INTEREST_PER_10G, MAX_INTEREST);
    income += interest;

    // Clean bonus
    if (cleanRound) {
      income += CLEAN_BONUS;
      player.streak++;
    } else {
      player.streak = 0;
    }

    // Streak bonus
    const streakIdx = Math.min(player.streak, STREAK_BONUS.length - 1);
    income += STREAK_BONUS[streakIdx];

    player.gold += income;
  }

  /** Gold reward for killing a mob */
  mobKillReward(round: number): number {
    for (const tier of KILL_REWARD_TIERS) {
      if (round <= tier.maxRound) {
        return tier.gold;
      }
    }
    return 1; // fallback
  }
}
