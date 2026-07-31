/**
 * Big Wheel 6 Game State Manager
 * 
 * Tracks the current state of the Big Wheel 6 game running in big_wheel_6.py
 * and broadcasts updates to connected web clients via socket.io.
 * 
 * big_wheel_6.py pushes state updates via HTTP POST to /api/big-wheel-6/state-update
 * 
 * IMPORTANT: The Python script is the source of truth for the winning number.
 * The server collects bets during the BETTING/SPINNING phase and defers
 * payout calculation until the Python script sends the RESULT phase with
 * the actual winning number. This ensures the visual wheel display and
 * the payout calculation use the SAME result.
 */

const db = require('./db');
const bigWheelGame = require('./games/big_wheel_6');

// Game phases matching big_wheel_6.py
const PHASES = {
  BETTING: 'BETTING',
  SPINNING: 'SPINNING',
  RESULT: 'RESULT'
};

let gameState = {
  phase: PHASES.BETTING,
  countdownSeconds: 30,
  message: null,         // Current notification message
  messageType: null,     // 'info', 'warning', 'error', 'success'
  betsLocked: false,
  result: null,           // Winning number from Python script (when phase is RESULT)
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
 * The bet is stored and will be processed when the Python script sends
 * the RESULT phase with the actual winning number.
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
 * Process all pending bets against the actual winning number from the Python script.
 * This is called when the Python script sends the RESULT phase with the result.
 */
function processPendingBets(winningNumber) {
  if (gameState.pendingBets.length === 0) {
    return [];
  }

  const results = [];

  for (const pendingBet of gameState.pendingBets) {
    try {
      // Calculate payout using the game logic, but with the Python script's result
      const { totalWinAmount, isWin, results: betResults } = bigWheelGame.calculatePayout(pendingBet.bets, winningNumber);
      
      const isHouseWin = winningNumber === "0";
      
      // Net change calculation (matching the logic in games/big_wheel_6.js)
      let netChange;
      if (isHouseWin) {
        netChange = -pendingBet.totalBet;
      } else if (isWin) {
        netChange = totalWinAmount - pendingBet.totalBet;
      } else {
        netChange = -pendingBet.totalBet;
      }
      
      const balance = db.getUserBalance(pendingBet.userId);
      const newBalance = balance + netChange;
      
      // Update user balance
      db.updateBalance(pendingBet.userId, newBalance);
      
      // Record transaction
      db.addTransaction(pendingBet.userId, 'big_wheel_6', pendingBet.totalBet, totalWinAmount, {
        bets: pendingBet.bets,
        winningNumber: winningNumber,
        result: isHouseWin ? 'house_wins' : (isWin ? 'player_wins' : 'loss'),
        betResults: betResults
      });
      
      results.push({
        userId: pendingBet.userId,
        betAmount: pendingBet.totalBet,
        winAmount: totalWinAmount,
        netChange: netChange,
        newBalance: newBalance,
        isWin: isWin,
        winningNumber: winningNumber,
        bets: pendingBet.bets,
        isHouseWin: isHouseWin
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
 * Update game state from big_wheel_6.py
 * Called via HTTP endpoint
 */
function updateFromPy(pyState) {
  if (pyState.phase !== undefined) gameState.phase = pyState.phase;
  if (pyState.countdownSeconds !== undefined) gameState.countdownSeconds = pyState.countdownSeconds;
  if (pyState.message !== undefined) gameState.message = pyState.message;
  if (pyState.messageType !== undefined) gameState.messageType = pyState.messageType;
  if (pyState.result !== undefined) gameState.result = pyState.result;

  // Auto-lock bets when phase is SPINNING or RESULT
  if (gameState.phase === PHASES.SPINNING || 
      gameState.phase === PHASES.RESULT) {
    gameState.betsLocked = true;
  } else if (pyState.betsLocked !== undefined) {
    // Allow Python script to explicitly set betsLocked (e.g., space bar → betting closed)
    gameState.betsLocked = pyState.betsLocked;
  } else {
    gameState.betsLocked = false;
  }

  // When the Python script sends the RESULT phase with the actual winning number,
  // process all pending bets against this result
  if (gameState.phase === PHASES.RESULT && gameState.result !== null) {
    const processedResults = processPendingBets(gameState.result);
    
    // Broadcast the RESULT phase with the winning number and processed results
    broadcastToBigWheel(processedResults);
  } else {
    // Clear result when going back to BETTING
    if (gameState.phase === PHASES.BETTING) {
      gameState.result = null;
    }
    
    // Broadcast state update
    broadcastToBigWheel();
  }
}

/**
 * Set a notification message
 */
function setNotification(message, type = 'info') {
  gameState.message = message;
  gameState.messageType = type;
  broadcastToBigWheel();
}

/**
 * Clear notification
 */
function clearNotification() {
  gameState.message = null;
  gameState.messageType = null;
  broadcastToBigWheel();
}

/**
 * Broadcast current state to all clients on the big wheel 6 page
 * @param {Array} [processedResults] - Optional array of processed bet results
 */
function broadcastToBigWheel(processedResults) {
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
  
  io.to('big_wheel_6').emit('big_wheel_6-state', broadcastData);
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
  broadcastToBigWheel,
  getState,
  PHASES,
  addPendingBet,
  getPendingBetCount,
  processPendingBets
};