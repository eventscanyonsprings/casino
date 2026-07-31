const express = require('express');
const router = express.Router();
const keno = require('../games/keno');

// POST /api/keno/play - Play a round of Keno
router.post('/play', (req, res) => {
  try {
    const userId = req.userId;
    const { picks, bet } = req.body;
    
    if (!picks || !Array.isArray(picks)) {
      return res.status(400).json({ error: 'picks must be an array of numbers' });
    }
    if (!bet || typeof bet !== 'number') {
      return res.status(400).json({ error: 'bet must be a number' });
    }
    
    const result = keno.playKeno(userId, picks, Math.floor(bet));
    
    res.json({
      success: true,
      result: {
        drawn: result.drawn,
        matches: result.matches,
        betAmount: result.betAmount,
        winAmount: result.winAmount,
        netChange: result.netChange,
        newBalance: result.newBalance,
        isWin: result.isWin
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/keno/state - Get current user state (balance, etc.)
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
        maxPicks: config.keno.max_picks,
        drawCount: config.keno.draw_count,
        totalNumbers: config.keno.total_numbers,
        payouts: config.keno.payouts
      }
    }
  });
});

module.exports = router;