import type { GameState, PlayerState } from '@ect/shared';
import {
  BASE_INCOME,
  INTEREST_PER_10G,
  MAX_INTEREST,
  CLEAN_BONUS,
  STREAK_BONUS,
  KILL_REWARD_TIERS,
  TOWER_MAP,
  getTowerStats,
} from '@ect/shared';

export class EconomyManager {
  state: GameState;

  constructor(state: GameState) {
    this.state = state;
  }

  /** Calculate and apply end-of-round income */
  endOfRoundIncome(player: PlayerState, cleanRound: boolean) {
    let income = BASE_INCOME;

    // Interest (1 per 10 gold, capped)
    let interestCap = MAX_INTEREST;
    // Check augment: GOLD_INTEREST raises cap
    if (player.augments.includes('GOLD_INTEREST')) {
      interestCap = 8;
    }
    const interest = Math.min(Math.floor(player.gold / 10) * INTEREST_PER_10G, interestCap);
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

    // Augment: INCOME_BOOST (+3 gold/round)
    if (player.augments.includes('INCOME_BOOST')) {
      income += 3;
    }

    // Income towers: generate gold
    for (const tower of player.towers) {
      const def = TOWER_MAP[tower.defId];
      if (def && def.towerType === 'income') {
        const stats = getTowerStats(def, tower.stars, player.augments);
        income += stats.incomePerRound || 0;
      }
    }

    player.gold += income;
  }

  /** Gold reward for killing a mob */
  mobKillReward(round: number): number {
    for (const tier of KILL_REWARD_TIERS) {
      if (round <= tier.maxRound) {
        return tier.gold;
      }
    }
    return 1;
  }
}
