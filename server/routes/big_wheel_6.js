const express = require('express');
const router = express.Router();
const bigWheel = require('../games/big_wheel_6');
const bigWheelState = require('../big_wheel_6-state');
const db = require('../db');

// POST /api/big-wheel-6/play - Place a bet on Big Wheel 6
// This deducts the balance and adds the bet to a pending queue.
// The actual result is determined later when the Python script sends
// the RESULT phase with the winning number.
router.post('/play', (req, res) => {
  try {
    const userId = req.userId;
    const { bets, totalBet } = req.body;
    
    if (!bets || typeof bets !== 'object') {
      return res.status(400).json({ error: 'bets must be an object of { value: amount }' });
    }
    if (!totalBet || typeof totalBet !== 'number') {
      return res.status(400).json({ error: 'totalBet must be a number' });
    }
    
    const balance = db.getUserBalance(userId);
    
    if (balance === null) {
      return res.status(400).json({ error: 'User not found' });
    }
    
    if (totalBet <= 0) {
      return res.status(400).json({ error: 'Bet must be greater than 0' });
    }
    
    if (totalBet > balance) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    // Validate bet values
    for (const value of Object.keys(bets)) {
      if (!bigWheel.POSSIBLE_BETS.includes(parseInt(value))) {
        return res.status(400).json({ error: `Invalid bet value: ${value}` });
      }
    }
    
    // Add the bet to the pending queue.
    // The balance will be deducted and the result calculated when the
    // Python script sends the RESULT phase with the actual winning number.
    // This ensures the visual wheel display and the payout calculation
    // use the SAME winning number.
    bigWheelState.addPendingBet(userId, bets, totalBet);
    
    res.json({
      success: true,
      pending: true,
      betAmount: totalBet
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/big-wheel-6/state - Get current user state (balance, etc.)
router.get('/state', (req, res) => {
  const db = require('../db');
  const userId = req.userId;
  const balance = db.getUserBalance(userId);
  const config = require('../config');
  
  res.json({
    success: true,
    state: {
      balance,
      config: {
        possibleBets: bigWheel.getPossibleBets()
      }
    }
  });
});

module.exports = router;