const express = require('express');
const router = express.Router();
const db = require('../db');
const blackjackState = require('../blackjack-state');

// GET /api/blackjack/state - Get current user state (balance, etc.)
router.get('/state', (req, res) => {
  const userId = req.userId;
  const balance = db.getUserBalance(userId);

  res.json({
    success: true,
    state: {
      balance,
      gameState: blackjackState.getState()
    }
  });
});

module.exports = router;
