const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');
const kenoState = require('./keno-state');
const bigWheel6State = require('./big_wheel_6-state');
const chickenRaceState = require('./chicken_race-state');
const blackjackState = require('./blackjack-state');

// Check for --clear-db flag to reset the database on startup
if (process.argv.includes('--clear-db')) {
  db.clearDb();
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3001;

// Initialize game states with socket.io
kenoState.init(io);
bigWheel6State.init(io);
chickenRaceState.init(io);
blackjackState.init(io);

// Parse JSON request bodies
app.use(express.json());

// User identification middleware
// Uses IP address by default, or X-Test-User header for bot testing
app.use((req, res, next) => {
  // For bot testing: X-Test-User header overrides IP
  const testUser = req.headers['x-test-user'] || req.query.test_user;
  const identifier = testUser || req.ip || req.connection.remoteAddress || 'unknown';
  
  // Get or create user, attach to request
  const user = db.getOrCreateUser(identifier);
  req.userId = user.id;
  req.userIdentifier = identifier;
  req.userBalance = user.balance;
  
  next();
});

// API routes
const kenoRoutes = require('./routes/keno');
app.use('/api/keno', kenoRoutes);

const scratchRoutes = require('./routes/scratch');
app.use('/api/scratch', scratchRoutes);

const bigWheelRoutes = require('./routes/big_wheel_6');
app.use('/api/big-wheel-6', bigWheelRoutes);

const chickenRaceRoutes = require('./routes/chicken_race');
app.use('/api/chicken-race', chickenRaceRoutes);

const blackjackRoutes = require('./routes/blackjack');
app.use('/api/blackjack', blackjackRoutes);

// POST /api/keno/state-update - keno.py pushes game state here
app.post('/api/keno/state-update', (req, res) => {
  try {
    const state = req.body;
    
    // Validate required fields
    if (!state.phase) {
      return res.status(400).json({ error: 'phase is required' });
    }
    
    // Map phase string to enum
    const validPhases = Object.values(kenoState.PHASES);
    if (!validPhases.includes(state.phase)) {
      return res.status(400).json({ error: `Invalid phase: ${state.phase}` });
    }
    
    kenoState.updateFromPy({
      phase: state.phase,
      drawNumber: state.drawNumber,
      countdownSeconds: state.countdownSeconds,
      drawnNumbers: state.drawnNumbers,
      message: state.message,
      messageType: state.messageType
    });
    
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/chicken-race/state-update - chicken_race.py pushes game state here
app.post('/api/chicken-race/state-update', (req, res) => {
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

// POST /api/big-wheel-6/state-update - big_wheel_6.py pushes game state here
app.post('/api/big-wheel-6/state-update', (req, res) => {
  try {
    const state = req.body;
    
    // Validate required fields
    if (!state.phase) {
      return res.status(400).json({ error: 'phase is required' });
    }
    
    // Map phase string to enum
    const validPhases = Object.values(bigWheel6State.PHASES);
    if (!validPhases.includes(state.phase)) {
      return res.status(400).json({ error: `Invalid phase: ${state.phase}` });
    }
    
    bigWheel6State.updateFromPy({
      phase: state.phase,
      countdownSeconds: state.countdownSeconds,
      message: state.message,
      messageType: state.messageType,
      betsLocked: state.betsLocked,
      result: state.result
    });
    
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/user - Get current user info
app.get('/api/user', (req, res) => {
  const balance = db.getUserBalance(req.userId);
  const d = db.getData();
  const user = d.users.find(u => u.id === req.userId);
  const isRegistered = !!(user && user.username && user.unit_number);
  res.json({
    success: true,
    user: {
      id: req.userId,
      identifier: req.userIdentifier,
      balance,
      username: user ? user.username : null,
      unit_number: user ? user.unit_number : null,
      isRegistered
    }
  });
});

// POST /api/user/register - Register or update user name and unit number
app.post('/api/user/register', (req, res) => {
  try {
    const { username, unit_number } = req.body;
    if (!username || !unit_number) {
      return res.status(400).json({ error: 'Username and unit number are required' });
    }
    const user = db.registerUser(req.userId, username.trim(), unit_number.trim());
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        unit_number: user.unit_number,
        balance: user.balance
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Track which game page the user is on
  socket.on('join-game', (game) => {
    // Leave all game rooms
    socket.rooms.forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
      }
    });
    
    if (game === 'keno') {
      socket.join('keno');
      // Send current state immediately
      socket.emit('keno-state', {
        phase: kenoState.getState().phase,
        drawNumber: kenoState.getState().drawNumber,
        countdownSeconds: kenoState.getState().countdownSeconds,
        drawnNumbers: kenoState.getState().drawnNumbers,
        message: kenoState.getState().message,
        messageType: kenoState.getState().messageType,
        betsLocked: kenoState.getState().betsLocked
      });
    } else if (game === 'big_wheel_6') {
      socket.join('big_wheel_6');
      // Send current state immediately
      const gs = bigWheel6State.getState();
      socket.emit('big_wheel_6-state', {
        phase: gs.phase,
        countdownSeconds: gs.countdownSeconds,
        message: gs.message,
        messageType: gs.messageType,
        betsLocked: gs.betsLocked,
        result: gs.result
      });
    } else if (game === 'chicken_race') {
      socket.join('chicken_race');
      // Send current state immediately
      const cs = chickenRaceState.getState();
      socket.emit('chicken_race-state', {
        phase: cs.phase,
        countdownSeconds: cs.countdownSeconds,
        message: cs.message,
        messageType: cs.messageType,
        betsLocked: cs.betsLocked,
        result: cs.result
      });
    } else if (game === 'blackjack') {
      socket.join('blackjack');
      socket.emit('blackjack-state', blackjackState.getPlayerState());
    } else if (game === 'blackjack_dealer') {
      socket.join('blackjack_dealer');
      socket.emit('blackjack-state', blackjackState.getDealerState());
    }
    console.log(`Client ${socket.id} joined game: ${game}`);
  });

  // Helper to get userId from socket connection context
  function getUserIdFromSocket(s) {
    const testUser = s.handshake.query.test_user;
    const identifier = testUser || s.handshake.address || 'unknown';
    const user = db.getOrCreateUser(identifier);
    return user.id;
  }

  // Blackjack gameplay actions
  socket.on('blackjack-join-request', () => {
    const userId = getUserIdFromSocket(socket);
    const d = db.getData();
    const user = d.users.find(u => u.id === userId);
    blackjackState.addJoinRequest(
      userId, 
      socket.id, 
      user ? user.username : 'Unknown', 
      user ? user.unit_number : 'Unknown'
    );
  });

  socket.on('blackjack-dealer-response', ({ userId, accept }) => {
    blackjackState.handleDealerResponse(userId, accept);
  });

  socket.on('blackjack-leave', () => {
    const userId = getUserIdFromSocket(socket);
    blackjackState.removePlayer(userId, socket.id);
  });

  socket.on('blackjack-bet-update', ({ bet }) => {
    const userId = getUserIdFromSocket(socket);
    blackjackState.updateBet(userId, bet);
  });

  socket.on('blackjack-clear-bet', () => {
    const userId = getUserIdFromSocket(socket);
    blackjackState.clearBet(userId);
  });

  socket.on('blackjack-play', () => {
    blackjackState.startGame();
  });

  socket.on('blackjack-hit', () => {
    const userId = getUserIdFromSocket(socket);
    blackjackState.handlePlayerHit(userId);
  });

  socket.on('blackjack-stand', () => {
    const userId = getUserIdFromSocket(socket);
    blackjackState.handlePlayerStand(userId);
  });

  socket.on('blackjack-deal-card', () => {
    blackjackState.handleDealerDealCard();
  });

  socket.on('blackjack-dealer-bets', () => {
    blackjackState.sendDealerNotification('Please place your bets!', 'warning');
  });

  socket.on('blackjack-reset', () => {
    blackjackState.resetState();
  });

  socket.on('disconnect', () => {
    blackjackState.handleDisconnect(socket.id);
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, '..', 'client')));

// Fallback to index.html for any route not found (SPA support)
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Casino server running at http://localhost:${PORT}`);
});