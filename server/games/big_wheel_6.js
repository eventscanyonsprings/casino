/**
 * Big Wheel 6 Game Logic
 * 
 * Standard Big 6 Wheel (56 segments):
 * - Payouts: bet on a number, if it hits you win at [number]:1 odds
 * - House only wins when the wheel lands on 0 (2 segments out of 56)
 * 
 * Wheel segment distribution (matching the visual wheel in big_wheel_6.py):
 *   - 0: 2 segments (house wins all bets)
 *   - 1: 27 segments (pays 1:1)
 *   - 2: 11 segments (pays 2:1)
 *   - 5: 7 segments (pays 5:1)
 *   - 10: 4 segments (pays 10:1)
 *   - 20: 2 segments (pays 20:1)
 *   - 40: 1 segment (pays 40:1)
 *   Total: 56 segments
 */

const db = require('../db');

const POSSIBLE_BETS = [1, 2, 5, 10, 20, 40];

// 56 wheel segments matching the Python visual wheel
const WHEEL_SEGMENTS = [
  "0", "1", "1", "5", "1", "40", "2", "1", "2", "1", "10", "2", "1", "5", "1", "2", "1", "5", "2", "1", "20", "1", "2", "1", "10", "1", "2", "1",
  "0", "1", "2", "1", "2", "1", "10", "1", "2", "1", "5", "1", "2", "1", "20", "1", "2", "1", "2", "1", "5", "1", "2", "10", "1", "5", "1", "2"
];

/**
 * Spin the wheel and return the winning value
 * @returns {string} The winning value ('0', '1', '2', '5', '10', '20', '40')
 */
function spinWheel() {
  const index = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
  return WHEEL_SEGMENTS[index];
}

/**
 * Calculate payout for a set of bets based on the winning number
 * @param {Object} bets - The bets placed, e.g. { "1": 5, "5": 10 }
 * @param {string} winningNumber - The winning number from the wheel
 * @returns {Object} { winAmount, isWin, results }
 */
function calculatePayout(bets, winningNumber) {
  let totalWinAmount = 0;
  let isWin = false;
  const results = {};

  for (const [value, amount] of Object.entries(bets)) {
    const betValue = parseInt(value);
    const betAmount = parseInt(amount);
    
    if (winningNumber === "0") {
      // House wins - player loses this bet
      results[value] = { bet: betAmount, win: 0, result: 'loss' };
    } else if (parseInt(winningNumber) === betValue) {
      // Player wins! Payout is [number]:1
      // e.g., bet on 5, wheel lands on 5 -> win 5x the bet amount
      const winAmount = betAmount * betValue;
      totalWinAmount += winAmount;
      isWin = true;
      results[value] = { bet: betAmount, win: winAmount, result: 'win' };
    } else {
      // Player loses this specific bet (wrong number)
      results[value] = { bet: betAmount, win: 0, result: 'loss' };
    }
  }

  return { totalWinAmount, isWin, results };
}

/**
 * Play a round of Big Wheel 6
 * @param {number} userId - The user's ID
 * @param {Object} bets - The bets placed, e.g. { "1": 5, "5": 10 }
 * @param {number} totalBet - Total amount bet
 * @returns {Object} Result object
 */
function playBigWheel(userId, bets, totalBet) {
  const balance = db.getUserBalance(userId);
  
  if (balance === null) {
    throw new Error('User not found');
  }
  
  if (totalBet <= 0) {
    throw new Error('Bet must be greater than 0');
  }
  
  if (totalBet > balance) {
    throw new Error('Insufficient balance');
  }
  
  // Validate bet values
  for (const value of Object.keys(bets)) {
    if (!POSSIBLE_BETS.includes(parseInt(value))) {
      throw new Error(`Invalid bet value: ${value}`);
    }
  }
  
  // Spin the wheel!
  const winningNumber = spinWheel();
  
  // Calculate payout
  const { totalWinAmount, isWin, results } = calculatePayout(bets, winningNumber);
  
  // Net change: winnings minus total bet
  // If they win, they get their bet back + winnings
  // If they lose, they lose their bet
  let netChange;
  if (winningNumber === "0") {
    // House wins - lose all bets
    netChange = -totalBet;
  } else if (isWin) {
    // Player wins: get back their original bet + profit
    // But they only get back the bet on the winning number, not all bets
    // Actually, in standard casino rules: winning bets get paid out, losing bets are taken
    // So netChange = totalWinAmount - (totalBet - winningBets)
    // But simpler: netChange = totalWinAmount - (totalBet - betOnWinningNumber)
    // Or even simpler: netChange = totalWinAmount - totalBet (since they already paid totalBet)
    // Wait, let me think about this more carefully.
    // 
    // The player paid totalBet from their balance.
    // If they win on number 5 with $10 bet, they win $10 * 5 = $50.
    // Their net change is +$50 (winnings) - they already paid the bet.
    // But they also lose their bets on other numbers.
    // So: netChange = totalWinAmount (from winning bets) - losingBets
    // where losingBets = totalBet - betOnWinningNumber
    // Actually, the simplest model:
    // - Player pays totalBet upfront
    // - If they win, they get paid totalWinAmount (which is betOnWinningNumber * winningNumber)
    // - Net change = totalWinAmount - totalBet
    netChange = totalWinAmount - totalBet;
  } else {
    // Player bet on a number that didn't hit, and it's not 0
    // e.g., bet on 5 but wheel landed on 1
    netChange = -totalBet;
  }
  
  const newBalance = balance + netChange;
  
  // Update user balance
  db.updateBalance(userId, newBalance);
  
  // Record transaction
  db.addTransaction(userId, 'big_wheel_6', totalBet, totalWinAmount, {
    bets: bets,
    winningNumber: winningNumber,
    result: winningNumber === "0" ? 'house_wins' : (isWin ? 'player_wins' : 'loss'),
    betResults: results
  });
  
  return {
    betAmount: totalBet,
    winAmount: totalWinAmount,
    netChange: netChange,
    newBalance: newBalance,
    isWin: isWin,
    winningNumber: winningNumber,
    bets: bets,
    isHouseWin: winningNumber === "0"
  };
}

/**
 * Get the list of possible bet values
 * @returns {number[]} Array of possible bet values
 */
function getPossibleBets() {
  return [...POSSIBLE_BETS];
}

module.exports = {
  playBigWheel,
  getPossibleBets,
  POSSIBLE_BETS,
  WHEEL_SEGMENTS,
  spinWheel,
  calculatePayout
};