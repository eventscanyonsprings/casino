const express = require('express');
const router = express.Router();
const scratch = require('../games/scratch');

// POST /api/scratch/play - Play a scratch card
router.post('/play', (req, res) => {
  try {
    const userId = req.userId;
    const result = scratch.playScratch(userId);
    
    res.json({
      success: true,
      result: {
        prizes: result.prizes,
        totalWin: result.totalWin,
        cost: result.cost,
        netChange: result.netChange,
        newBalance: result.newBalance,
        isWin: result.isWin
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/scratch/state - Get scratch game config
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
        cost: config.scratch.cost,
        rows: config.scratch.rows,
        prizes: config.scratch.prizes
      }
    }
  });
});

module.exports = router;