const config = require('../config');
const db = require('../db');

/**
 * Generate scratch card prizes for each row
 * @param {number} rows - Number of rows (default from config)
 * @returns {number[]} Array of prize amounts per row
 */
function generatePrizes(rows = config.scratch.rows) {
  const prizes = [];
  const prizeOptions = config.scratch.prizes;
  const probabilities = config.scratch.probabilities;
  
  for (let i = 0; i < rows; i++) {
    const rand = Math.random();
    let cumulative = 0;
    let selectedPrize = prizeOptions[0];
    
    for (let j = 0; j < prizeOptions.length; j++) {
      cumulative += probabilities[j];
      if (rand < cumulative) {
        selectedPrize = prizeOptions[j];
        break;
      }
    }
    
    prizes.push(selectedPrize);
  }
  
  return prizes;
}

/**
 * Play a scratch card game
 * @param {number} userId - Database user ID
 * @returns {object} Game result
 */
function playScratch(userId) {
  const cost = config.scratch.cost;
  
  // Check user balance
  const balance = db.getUserBalance(userId);
  if (balance === null) {
    throw new Error('User not found');
  }
  if (balance < cost) {
    throw new Error('Insufficient balance');
  }
  
  // Generate prizes
  const prizes = generatePrizes();
  const totalWin = prizes.reduce((sum, p) => sum + p, 0);
  const netChange = totalWin - cost;
  const newBalance = balance + netChange;
  
  // Record transaction
  db.addTransaction(userId, 'scratch', cost, totalWin, {
    prizes,
    rows: config.scratch.rows
  });
  
  // Update balance
  db.updateBalance(userId, newBalance);
  
  return {
    prizes,
    totalWin,
    cost,
    netChange,
    newBalance,
    isWin: totalWin > 0
  };
}

module.exports = {
  generatePrizes,
  playScratch
};