/**
 * Chicken Race Game State Manager
 * 
 * Tracks the current state of the Chicken Race game running in chicken_race.py
 * and broadcasts updates to connected web clients via socket.io.
 * 
 * chicken_race.py pushes state updates via HTTP POST to /api/chicken-race/state-update
 * 
 * IMPORTANT: The Python script is the source of truth for the winning chicken.
 * The server collects bets during the BETTING phase and defers payout calculation
 * until the Python script sends the RESULT phase with the actual winning chicken.
 * This ensures the visual race display and the payout calculation use the SAME result.
 */

const db = require('./db');
const chickenRaceGame = require('./games/chicken_race');

// Game phases matching chicken_race.py
const PHASES = {
  BETTING: 'BETTING',
  RACING: 'RACING',
  RESULT: 'RESULT'
};

let gameState = {
  phase: PHASES.BETTING,
  countdownSeconds: 30,
  message: null,         // Current notification message
  messageType: null,     // 'info', 'warning', 'error', 'success'
  betsLocked: false,
  result: null,           // Winning chicken number from Python script (when phase is RESULT)
  pendingBets: []         // Bets placed but not yet resolved (waiting for Python result)
};

// Store socket.io instance for broadcasting
let io = null;

/**
 * Initialize with socket.io instance
 */
function init(socketIO) {
  io = socketIO;
}

/**
 * Add a pending bet to the queue.
 * Called via the /api/chicken-race/play HTTP endpoint.
 * The balance is NOT deducted here - it's deducted when the result is processed,
 * which keeps the balance in sync with the Python visual game result.
 */
function addPendingBet(userId, bets, totalBet) {
  gameState.pendingBets.push({
    userId: userId,
    bets: bets,
    totalBet: totalBet,
    timestamp: Date.now()
  });
}

/**
 * Get the current pending bets count
 */
function getPendingBetCount() {
  return gameState.pendingBets.length;
}

/**
 * Process all pending bets against the actual winning chicken from the Python script.
 * This is called when the Python script sends the RESULT phase with the result.
 * @returns {Array} Processed results with balances updated
 */
function processPendingBets(winningChicken) {
  if (gameState.pendingBets.length === 0) {
    return [];
  }

  const results = [];

  for (const pendingBet of gameState.pendingBets) {
    try {
      // Calculate payout using the game logic, but with the Python script's result
      const { totalWinAmount, isWin, results: betResults } = chickenRaceGame.calculatePayout(pendingBet.bets, winningChicken);

      // Net change: winnings minus total bet
      const netChange = totalWinAmount - pendingBet.totalBet;

      const balance = db.getUserBalance(pendingBet.userId);
      const newBalance = balance + netChange;

      // Update user balance
      db.updateBalance(pendingBet.userId, newBalance);

      // Record transaction
      db.addTransaction(pendingBet.userId, 'chicken_race', pendingBet.totalBet, totalWinAmount, {
        bets: pendingBet.bets,
        winningChicken: winningChicken,
        result: isWin ? 'player_wins' : 'loss',
        betResults: betResults
      });

      results.push({
        userId: pendingBet.userId,
        betAmount: pendingBet.totalBet,
        winAmount: totalWinAmount,
        netChange: netChange,
        newBalance: newBalance,
        isWin: isWin,
        winningChicken: winningChicken,
        bets: pendingBet.bets
      });
    } catch (err) {
      console.error(`Error processing pending bet for user ${pendingBet.userId}:`, err.message);
    }
  }

  // Clear the pending bets queue
  gameState.pendingBets = [];

  return results;
}

/**
 * Update game state from chicken_race.py
 * Called via HTTP endpoint
 */
function updateFromPy(pyState) {
  if (pyState.phase !== undefined) gameState.phase = pyState.phase;
  if (pyState.countdownSeconds !== undefined) gameState.countdownSeconds = pyState.countdownSeconds;
  if (pyState.message !== undefined) gameState.message = pyState.message;
  if (pyState.messageType !== undefined) gameState.messageType = pyState.messageType;
  if (pyState.result !== undefined) gameState.result = pyState.result;

  // Auto-lock bets when race starts
  if (gameState.phase === PHASES.RACING) {
    gameState.betsLocked = true;
  } else if (gameState.phase === PHASES.RESULT) {
    gameState.betsLocked = true;
  } else if (pyState.betsLocked !== undefined) {
    // Allow Python script to explicitly set betsLocked
    gameState.betsLocked = pyState.betsLocked;
  } else {
    gameState.betsLocked = false;
  }

  // When the Python script sends the RESULT phase with the actual winning chicken,
  // process all pending bets against this result
  if (gameState.phase === PHASES.RESULT && gameState.result !== null) {
    const processedResults = processPendingBets(gameState.result);

    // Broadcast the RESULT phase with the winning chicken and processed results
    broadcastToChickenRace(processedResults);
  } else {
    // Clear result when going back to BETTING
    if (gameState.phase === PHASES.BETTING) {
      gameState.result = null;
    }

    // Broadcast state update
    broadcastToChickenRace();
  }
}

/**
 * Set a notification message
 */
function setNotification(message, type = 'info') {
  gameState.message = message;
  gameState.messageType = type;
  broadcastToChickenRace();
}

/**
 * Clear notification
 */
function clearNotification() {
  gameState.message = null;
  gameState.messageType = null;
  broadcastToChickenRace();
}

/**
 * Broadcast current state to all clients on the chicken race page
 * @param {Array} [processedResults] - Optional array of processed bet results
 */
function broadcastToChickenRace(processedResults) {
  if (!io) return;

  const broadcastData = {
    phase: gameState.phase,
    countdownSeconds: gameState.countdownSeconds,
    message: gameState.message,
    messageType: gameState.messageType,
    betsLocked: gameState.betsLocked,
    result: gameState.result
  };

  // Include processed results when available (RESULT phase)
  if (processedResults && processedResults.length > 0) {
    broadcastData.processedResults = processedResults;
  }

  io.to('chicken_race').emit('chicken_race-state', broadcastData);
}

/**
 * Get current game state
 */
function getState() {
  return { ...gameState, pendingBets: [...gameState.pendingBets] };
}

module.exports = {
  init,
  updateFromPy,
  setNotification,
  clearNotification,
  broadcastToChickenRace,
  getState,
  PHASES,
  addPendingBet,
  getPendingBetCount,
  processPendingBets
};