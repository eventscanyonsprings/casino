const express = require('express');
const router = express.Router();
const chickenRace = require('../games/chicken_race');
const chickenRaceState = require('../chicken_race-state');
const db = require('../db');

// POST /api/chicken-race/state-update - chicken_race.py pushes game state here
router.post('/state-update', (req, res) => {
  try {
    const state = req.body;

    // Validate required fields
    if (!state.phase) {
      return res.status(400).json({ error: 'phase is required' });
    }

    // Map phase string to enum
    const validPhases = Object.values(chickenRaceState.PHASES);
    if (!validPhases.includes(state.phase)) {
      return res.status(400).json({ error: `Invalid phase: ${state.phase}` });
    }

    chickenRaceState.updateFromPy({
      phase: state.phase,
      countdownSeconds: state.countdownSeconds,
      message: state.message,
      messageType: state.messageType,
      result: state.result,
      betsLocked: state.betsLocked
    });

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/chicken-race/play - Place a bet on a chicken
// This adds the bet to a pending queue. The actual result is determined later
// when the Python script sends the RESULT phase with the winning chicken.
router.post('/play', (req, res) => {
  try {
    const userId = req.userId;
    const { bets, totalBet } = req.body;

    if (!bets || typeof bets !== 'object') {
      return res.status(400).json({ error: 'bets must be an object of { chicken: amount }' });
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
    for (const chicken of Object.keys(bets)) {
      if (!chickenRace.VALID_CHICKENS.includes(parseInt(chicken))) {
        return res.status(400).json({ error: `Invalid chicken number: ${chicken}` });
      }
    }

    // Add the bet to the pending queue.
    // The balance will be deducted and the result calculated when the
    // Python script sends the RESULT phase with the actual winning chicken.
    // This ensures the visual race display and the payout calculation
    // use the SAME winning chicken.
    chickenRaceState.addPendingBet(userId, bets, totalBet);

    res.json({
      success: true,
      pending: true,
      betAmount: totalBet
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/chicken-race/state - Get current user state (balance, etc.)
router.get('/state', (req, res) => {
  const userId = req.userId;
  const balance = db.getUserBalance(userId);

  res.json({
    success: true,
    state: {
      balance,
      config: {
        chickenNames: chickenRace.CHICKEN_NAMES,
        payoutMultiplier: chickenRace.PAYOUT_MULTIPLIER
      }
    }
  });
});

module.exports = router;