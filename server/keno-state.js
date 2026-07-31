/**
 * Keno Game State Manager
 * 
 * Tracks the current state of the Keno game running in keno.py
 * and broadcasts updates to connected web clients via socket.io.
 * 
 * keno.py pushes state updates via HTTP POST to /api/keno/state-update
 */

// Game phases matching keno.py
const PHASES = {
  BETTING: 'BETTING',
  CLOSING: 'CLOSING',
  DRAWING: 'DRAWING',
  FINALIZED: 'FINALIZED'
};

let gameState = {
  phase: PHASES.BETTING,
  drawNumber: 1,
  countdownSeconds: 30,
  drawnNumbers: [],
  message: null,         // Current notification message
  messageType: null,     // 'info', 'warning', 'error', 'success'
  betsLocked: false
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
 * Update game state from keno.py
 * Called via HTTP endpoint
 */
function updateFromPy(pyState) {
  if (pyState.phase !== undefined) gameState.phase = pyState.phase;
  if (pyState.drawNumber !== undefined) gameState.drawNumber = pyState.drawNumber;
  if (pyState.countdownSeconds !== undefined) gameState.countdownSeconds = pyState.countdownSeconds;
  if (pyState.drawnNumbers !== undefined) gameState.drawnNumbers = pyState.drawnNumbers;
  if (pyState.message !== undefined) gameState.message = pyState.message;
  if (pyState.messageType !== undefined) gameState.messageType = pyState.messageType;
  if (pyState.betsLocked !== undefined) gameState.betsLocked = pyState.betsLocked;

  // Auto-lock bets when phase is CLOSING or beyond
  if (gameState.phase === PHASES.CLOSING || 
      gameState.phase === PHASES.DRAWING || 
      gameState.phase === PHASES.FINALIZED) {
    gameState.betsLocked = true;
  } else {
    gameState.betsLocked = false;
  }

  // Broadcast to all connected keno clients
  broadcastToKeno();
}

/**
 * Set a notification message
 */
function setNotification(message, type = 'info') {
  gameState.message = message;
  gameState.messageType = type;
  broadcastToKeno();
}

/**
 * Clear notification
 */
function clearNotification() {
  gameState.message = null;
  gameState.messageType = null;
  broadcastToKeno();
}

/**
 * Broadcast current state to all clients on the keno page
 */
function broadcastToKeno() {
  if (!io) return;
  io.to('keno').emit('keno-state', {
    phase: gameState.phase,
    drawNumber: gameState.drawNumber,
    countdownSeconds: gameState.countdownSeconds,
    drawnNumbers: gameState.drawnNumbers,
    message: gameState.message,
    messageType: gameState.messageType,
    betsLocked: gameState.betsLocked
  });
}

/**
 * Get current game state
 */
function getState() {
  return { ...gameState };
}

module.exports = {
  init,
  updateFromPy,
  setNotification,
  clearNotification,
  broadcastToKeno,
  getState,
  PHASES
};