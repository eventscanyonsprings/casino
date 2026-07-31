const config = require('../config');
const db = require('../db');

/**
 * Draw random numbers for Keno
 * @param {number} count - How many numbers to draw (default from config)
 * @param {number} max - Maximum number value (default from config)
 * @returns {number[]} Sorted array of drawn numbers
 */
function drawNumbers(count = config.keno.draw_count, max = config.keno.total_numbers) {
  const pool = [];
  for (let i = 1; i <= max; i++) {
    pool.push(i);
  }
  
  const drawn = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    drawn.push(pool[idx]);
    pool.splice(idx, 1);
  }
  
  return drawn.sort((a, b) => a - b);
}

/**
 * Calculate how many of the player's picks match the drawn numbers
 * @param {number[]} picks - Player's selected numbers
 * @param {number[]} drawn - House drawn numbers
 * @returns {number} Count of matches
 */
function calculateMatches(picks, drawn) {
  const drawnSet = new Set(drawn);
  return picks.filter(n => drawnSet.has(n)).length;
}

/**
 * Calculate payout based on number of matches and bet amount
 * @param {number} matches - Number of matching numbers
 * @param {number} betAmount - Amount wagered
 * @returns {number} Win amount (0 if no win)
 */
function calculatePayout(matches, betAmount) {
  const payouts = config.keno.payouts;
  
  // 0-2 matches = no win
  if (matches < 3) return 0;
  
  const multiplier = payouts[matches];
  if (!multiplier) return 0;
  
  return betAmount * multiplier;
}

/**
 * Play a full Keno game round
 * @param {number} userId - Database user ID
 * @param {number[]} picks - Array of selected numbers (1-40)
 * @param {number} betAmount - Amount to wager
 * @returns {object} Game result
 */
function playKeno(userId, picks, betAmount) {
  // Validate picks
  if (!Array.isArray(picks) || picks.length === 0 || picks.length > config.keno.max_picks) {
    throw new Error(`You must pick between 1 and ${config.keno.max_picks} numbers`);
  }
  
  // Validate numbers are in range
  for (const n of picks) {
    if (!Number.isInteger(n) || n < 1 || n > config.keno.total_numbers) {
      throw new Error(`Invalid number: ${n}. Must be between 1 and ${config.keno.total_numbers}`);
    }
  }
  
  // Check for duplicates
  const unique = new Set(picks);
  if (unique.size !== picks.length) {
    throw new Error('Duplicate numbers are not allowed');
  }
  
  // Validate bet
  if (!Number.isInteger(betAmount) || betAmount <= 0) {
    throw new Error('Bet must be a positive integer');
  }
  
  // Check user balance
  const balance = db.getUserBalance(userId);
  if (balance === null) {
    throw new Error('User not found');
  }
  if (balance < betAmount) {
    throw new Error('Insufficient balance');
  }
  
  // Play the game
  const drawn = drawNumbers();
  const matches = calculateMatches(picks, drawn);
  const winAmount = calculatePayout(matches, betAmount);
  const netChange = winAmount - betAmount;
  const newBalance = balance + netChange;
  
  // Record transaction
  db.addTransaction(userId, 'keno', betAmount, winAmount, {
    picks,
    drawn,
    matches
  });
  
  // Update balance
  db.updateBalance(userId, newBalance);
  
  return {
    drawn,
    matches,
    betAmount,
    winAmount,
    netChange,
    newBalance,
    isWin: winAmount > 0
  };
}

module.exports = {
  drawNumbers,
  calculateMatches,
  calculatePayout,
  playKeno
};