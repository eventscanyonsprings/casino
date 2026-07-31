/**
 * Chicken Race Game Logic
 * 
 * Bet on one of 5 chickens. If your chicken wins, you get paid 5:1 odds.
 * The winning chicken is determined by the Python visual game (chicken_race.py),
 * which is the source of truth. This module only handles bet validation/appraisal.
 */

// Names matching scripts/chicken_race.py
const CHICKEN_NAMES = {
  1: "Cluck Norris",
  2: "Beakoncé",
  3: "Chick Jagger",
  4: "Yolko Ono",
  5: "Egg Sheeran"
};

// 5 chickens -> 5:1 payout
const PAYOUT_MULTIPLIER = 5;

const VALID_CHICKENS = [1, 2, 3, 4, 5];

/**
 * Calculate payout for a set of bets based on the winning chicken.
 * @param {Object} bets - The bets placed, e.g. { "1": 5, "3": 10 }
 * @param {number|string} winningChicken - The winning chicken number (1-5)
 * @returns {Object} { winAmount, isWin, results }
 */
function calculatePayout(bets, winningChicken) {
  const winningNumber = parseInt(winningChicken);
  let totalWinAmount = 0;
  let isWin = false;
  const results = {};

  for (const [chicken, amount] of Object.entries(bets)) {
    const betChicken = parseInt(chicken);
    const betAmount = parseInt(amount);

    if (betChicken === winningNumber) {
      // Player wins! Payout is 5:1 odds
      const winAmount = betAmount * PAYOUT_MULTIPLIER;
      totalWinAmount += winAmount;
      isWin = true;
      results[chicken] = { bet: betAmount, win: winAmount, result: 'win' };
    } else {
      // Player loses this bet (wrong chicken)
      results[chicken] = { bet: betAmount, win: 0, result: 'loss' };
    }
  }

  return { totalWinAmount, isWin, results };
}

module.exports = {
  calculatePayout,
  CHICKEN_NAMES,
  PAYOUT_MULTIPLIER,
  VALID_CHICKENS
};