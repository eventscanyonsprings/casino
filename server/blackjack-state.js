const db = require('./db');

// Game phases
const PHASES = {
  LOBBY: 'LOBBY',
  PLAYING: 'PLAYING',
  DEALER_TURN: 'DEALER_TURN',
  RESOLVED: 'RESOLVED'
};

// Player statuses
const STATUSES = {
  WAITING: 'WAITING',      // Joined, waiting for round to start or turn to arrive
  PLAYING: 'PLAYING',      // Active turn, choosing HIT or STAND
  STOOD: 'STOOD',          // Finished turn, stood on their score
  BUSTED: 'BUSTED',        // Finished turn, score > 21
  BLACKJACK: 'BLACKJACK',  // Got a natural 21 (Ace + 10-value card) on start
  JOINED: 'JOINED'         // In the lobby, ready for the next game
};

let io = null; // Socket.io server instance

// Internal Game State
let state = {
  phase: PHASES.LOBBY,
  players: [],        // Active players in the current game
  joinRequests: [],   // Pending join requests waiting for dealer approval
  deck: [],           // Current shoe/deck of cards
  dealerCards: [],    // Cards held by the dealer
  dealerScore: 0,
  dealerReveal: false,// Whether dealer's face-down card is flipped
  activePlayerIndex: -1, // Index of the player whose turn it is
  activeAction: 'none'  // 'none' or 'wants_hit'
};

/**
 * Initialize state manager with Socket.io instance
 */
function init(socketIO) {
  io = socketIO;
  resetState();
}

/**
 * Reset game state back to LOBBY (keeps existing players)
 */
function resetState() {
  state.phase = PHASES.LOBBY;
  state.deck = [];
  state.dealerCards = [];
  state.dealerScore = 0;
  state.dealerReveal = false;
  state.activePlayerIndex = -1;
  state.activeAction = 'none';

  // Keep players, but reset their card states
  state.players.forEach(p => {
    p.cards = [];
    p.score = 0;
    p.status = STATUSES.JOINED;
  });

  broadcastState();
}

/**
 * Create a fresh 52-card deck
 */
function createDeck() {
  const suits = ['C', 'D', 'H', 'S']; // Clubs, Diamonds, Hearts, Spades
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const newDeck = [];
  for (const s of suits) {
    for (const v of values) {
      newDeck.push(v + s);
    }
  }
  return newDeck;
}

/**
 * Shuffle the deck using Fisher-Yates algorithm
 */
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Calculate the best possible blackjack score for a set of cards
 */
function calculateScore(cards) {
  if (!cards || cards.length === 0) return 0;
  
  let score = 0;
  let acesCount = 0;
  
  for (const card of cards) {
    const valueChar = card.charAt(0);
    if (valueChar === 'A') {
      acesCount++;
      score += 11;
    } else if (['T', 'J', 'Q', 'K'].includes(valueChar)) {
      score += 10;
    } else {
      score += parseInt(valueChar, 10);
    }
  }
  
  while (score > 21 && acesCount > 0) {
    score -= 10;
    acesCount--;
  }
  
  return score;
}

/**
 * Check if a hand is a natural Blackjack (2 cards totaling 21)
 */
function isNaturalBlackjack(cards) {
  return cards.length === 2 && calculateScore(cards) === 21;
}

/**
 * Broadcast current state to both players and dealers
 */
function broadcastState() {
  if (!io) return;

  // For players, we filter the dealer's second card if not revealed
  const getDealerCardsForPlayers = () => {
    if (state.dealerReveal || state.dealerCards.length < 2) {
      return state.dealerCards;
    }
    // Return first card and a card back placeholder for the second card
    return [state.dealerCards[0], '1B'];
  };

  const getDealerScoreForPlayers = () => {
    if (state.dealerReveal || state.dealerCards.length < 2) {
      return state.dealerScore;
    }
    // Only return the score of the first dealer card
    return calculateScore([state.dealerCards[0]]);
  };

  // Broadcast full state to dealer
  io.to('blackjack_dealer').emit('blackjack-state', {
    phase: state.phase,
    players: state.players,
    joinRequests: state.joinRequests,
    deckCount: state.deck.length,
    dealerCards: state.dealerCards,
    dealerScore: state.dealerScore,
    dealerReveal: state.dealerReveal,
    activePlayerIndex: state.activePlayerIndex,
    activeAction: state.activeAction
  });

  // Broadcast safe state to players
  io.to('blackjack').emit('blackjack-state', {
    phase: state.phase,
    players: state.players.map(p => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      bet: p.bet,
      cards: p.cards,
      score: p.score,
      status: p.status
    })),
    deckCount: state.deck.length,
    dealerCards: getDealerCardsForPlayers(),
    dealerScore: getDealerScoreForPlayers(),
    dealerReveal: state.dealerReveal,
    activePlayerIndex: state.activePlayerIndex,
    activeAction: state.activeAction
  });
}

/**
 * Handle a player request to join the game
 */
function addJoinRequest(userId, socketId, username, unitNumber) {
  // If game in progress, they cannot join
  if (state.phase !== PHASES.LOBBY) {
    if (io) {
      io.to(socketId).emit('blackjack-join-error', 'A game is currently in progress. Please wait for it to finish.');
    }
    return;
  }

  // Check if player is already in active player list
  const alreadyJoined = state.players.some(p => p.id === userId);
  if (alreadyJoined) {
    if (io) {
      io.to(socketId).emit('blackjack-join-success', { msg: 'Already joined' });
    }
    // Update socketId in case of reconnection
    const p = state.players.find(p => p.id === userId);
    p.socketId = socketId;
    broadcastState();
    return;
  }

  // Check if already in pending join requests
  const alreadyPending = state.joinRequests.some(r => r.id === userId);
  if (alreadyPending) {
    // Update socketId in case of page reload/reconnection
    const r = state.joinRequests.find(r => r.id === userId);
    r.socketId = socketId;
    broadcastState();
    return;
  }

  // Add to join requests queue
  state.joinRequests.push({
    id: userId,
    name: username,
    unit: unitNumber,
    socketId: socketId
  });

  // Send a state update to the dealer (which displays the popup modal)
  broadcastState();
}

/**
 * Handle dealer accepting/rejecting a player
 */
function handleDealerResponse(userId, accept) {
  const reqIndex = state.joinRequests.findIndex(r => r.id === userId);
  if (reqIndex === -1) return;

  const request = state.joinRequests[reqIndex];
  state.joinRequests.splice(reqIndex, 1);

  if (accept) {
    // Create new player object and add to end of list
    state.players.push({
      id: request.id,
      name: request.name,
      unit: request.unit,
      socketId: request.socketId,
      bet: 0,
      cards: [],
      score: 0,
      status: STATUSES.JOINED
    });

    if (io) {
      io.to(request.socketId).emit('blackjack-join-success', { msg: 'Dealer approved your request.' });
    }
  } else {
    if (io) {
      io.to(request.socketId).emit('blackjack-join-rejected', 'Dealer declined your request to join.');
    }
  }

  broadcastState();
}

/**
 * Handle player leaving the game
 */
function removePlayer(userId, socketId) {
  // Check pending join requests
  const reqIndex = state.joinRequests.findIndex(r => (userId && r.id === userId) || (socketId && r.socketId === socketId));
  if (reqIndex !== -1) {
    state.joinRequests.splice(reqIndex, 1);
    broadcastState();
    return;
  }

  // Check active players
  const playerIndex = state.players.findIndex(p => (userId && p.id === userId) || (socketId && p.socketId === socketId));
  if (playerIndex === -1) return;

  const player = state.players[playerIndex];

  // If game is in progress, they forfeit their bet
  const gameActive = [PHASES.PLAYING, PHASES.DEALER_TURN].includes(state.phase);
  if (gameActive && player.bet > 0 && player.status !== STATUSES.BUSTED && player.status !== STATUSES.STOOD && player.status !== STATUSES.BLACKJACK) {
    // Note: The bet was already deducted when game started, so they've already lost the cash.
    // We just record the forfeit transaction for auditing.
    db.addTransaction(player.id, 'blackjack', player.bet, 0, {
      result: 'left_game_forfeit',
      playerScore: player.score,
      playerCards: player.cards,
      dealerScore: state.dealerScore,
      dealerCards: state.dealerCards
    });
  }

  // Remove player from active list
  state.players.splice(playerIndex, 1);

  // If they were the active player during a game, advance turn
  if (state.phase === PHASES.PLAYING && state.activePlayerIndex === playerIndex) {
    // Check if any players left
    if (state.players.length === 0) {
      resetState();
    } else {
      // Adjust activePlayerIndex back by 1 so advanceTurn moves to the element now occupying this index
      state.activePlayerIndex--;
      advanceTurn();
    }
  } else if (state.phase === PHASES.PLAYING && state.activePlayerIndex > playerIndex) {
    // Adjust active index down by 1 since we deleted a player before them
    state.activePlayerIndex--;
  }

  broadcastState();
}

/**
 * Handle player disconnecting
 */
function handleDisconnect(socketId) {
  // Find if they are in joinRequests, remove immediately
  const reqIndex = state.joinRequests.findIndex(r => r.socketId === socketId);
  if (reqIndex !== -1) {
    state.joinRequests.splice(reqIndex, 1);
    broadcastState();
    return;
  }

  // Find if they are in players
  const player = state.players.find(p => p.socketId === socketId);
  if (!player) return;

  if (state.phase === PHASES.LOBBY || state.phase === PHASES.RESOLVED) {
    // In lobby/resolved, remove them immediately
    removePlayer(player.id, socketId);
  } else {
    // In active game, just mark their socket as null (offline) but do not remove them yet
    // This allows them to reconnect and resume
    player.socketId = null;
    broadcastState();
  }
}

/**
 * Handle player updating their bet amount
 */
function updateBet(userId, betAmount) {
  if (state.phase !== PHASES.LOBBY) return;

  const player = state.players.find(p => p.id === userId);
  if (!player) return;

  const balance = db.getUserBalance(userId);
  if (betAmount < 0) return;
  
  if (betAmount > balance) {
    if (io) {
      io.to(player.socketId).emit('blackjack-error', 'Insufficient balance for that bet amount.');
    }
    return;
  }

  player.bet = betAmount;
  broadcastState();
}

/**
 * Handle player clearing their bet amount
 */
function clearBet(userId) {
  if (state.phase !== PHASES.LOBBY) return;

  const player = state.players.find(p => p.id === userId);
  if (!player) return;

  player.bet = 0;
  broadcastState();
}

/**
 * Start the blackjack game
 */
function startGame() {
  if (state.phase !== PHASES.LOBBY) return;

  if (state.players.length === 0) {
    broadcastNotification('Cannot start game: No players have joined.', 'error');
    return;
  }

  // Ensure all players have bet > 0
  const missingBets = state.players.some(p => p.bet <= 0);
  if (missingBets) {
    broadcastNotification('Cannot start game: All players must place a bet.', 'error');
    return;
  }

  // Verify and deduct balances
  try {
    for (const p of state.players) {
      const balance = db.getUserBalance(p.id);
      if (balance < p.bet) {
        broadcastNotification(`Cannot start game: ${p.name} has insufficient balance.`, 'error');
        return;
      }
    }

    // Deduct bet amounts from db immediately to secure bets
    for (const p of state.players) {
      const balance = db.getUserBalance(p.id);
      db.updateBalance(p.id, balance - p.bet);
    }
  } catch (err) {
    console.error('Error starting blackjack game:', err);
    broadcastNotification('Database error starting game. Please try again.', 'error');
    return;
  }

  // Shuffling the deck (standard 52 deck)
  state.deck = shuffle(createDeck());
  state.dealerCards = [];
  state.dealerScore = 0;
  state.dealerReveal = false;
  state.activeAction = 'none';

  // Reset and set player states to WAITING
  state.players.forEach(p => {
    p.cards = [];
    p.score = 0;
    p.status = STATUSES.WAITING;
  });

  // Deal initial 2 cards (alternating: player, dealer, player, dealer)
  for (let round = 0; round < 2; round++) {
    for (const p of state.players) {
      p.cards.push(state.deck.pop());
    }
    state.dealerCards.push(state.deck.pop());
  }

  // Calculate scores
  state.players.forEach(p => {
    p.score = calculateScore(p.cards);
    if (p.score === 21) {
      p.status = STATUSES.BLACKJACK;
    }
  });
  state.dealerScore = calculateScore(state.dealerCards);

  // Transition to PLAYING phase
  state.phase = PHASES.PLAYING;
  
  // Set first active player index
  state.activePlayerIndex = -1;
  advanceTurn();
}

/**
 * Move the turn to the next player
 */
function advanceTurn() {
  state.activeAction = 'none';

  // Find next player who doesn't have blackjack (since natural blackjack stands automatically)
  let nextIndex = state.activePlayerIndex + 1;
  while (nextIndex < state.players.length) {
    const player = state.players[nextIndex];
    if (player.status !== STATUSES.BLACKJACK) {
      break;
    }
    nextIndex++;
  }

  if (nextIndex < state.players.length) {
    // Next player's turn
    state.activePlayerIndex = nextIndex;
    state.players.forEach((p, idx) => {
      if (idx === nextIndex) {
        p.status = STATUSES.PLAYING;
      } else if (p.status === STATUSES.PLAYING) {
        // If they were playing, they stood
        p.status = STATUSES.STOOD;
      }
    });
  } else {
    // All players finished, move to Dealer's turn!
    state.activePlayerIndex = -1;
    state.phase = PHASES.DEALER_TURN;
    state.dealerReveal = false; // Dealer must touch the deck to flip the hidden card
  }

  broadcastState();
}

/**
 * Player wants a HIT, flag the dealer's deck
 */
function handlePlayerHit(userId) {
  if (state.phase !== PHASES.PLAYING) return;
  
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || activePlayer.id !== userId) return;

  state.activeAction = 'wants_hit';
  broadcastState();
}

/**
 * Player wants to STAND, finalize their turn immediately
 */
function handlePlayerStand(userId) {
  if (state.phase !== PHASES.PLAYING) return;

  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || activePlayer.id !== userId) return;

  activePlayer.status = STATUSES.STOOD;
  advanceTurn();
}

/**
 * Dealer clicks the deck to deal a card (either to player or to themselves)
 */
function handleDealerDealCard() {
  if (state.phase === PHASES.PLAYING) {
    // Deal a card to the active player if they want a hit
    if (state.activeAction !== 'wants_hit') return;

    const activePlayer = state.players[state.activePlayerIndex];
    if (!activePlayer) return;

    // Draw card
    const card = state.deck.pop();
    activePlayer.cards.push(card);
    activePlayer.score = calculateScore(activePlayer.cards);
    state.activeAction = 'none';

    if (activePlayer.score > 21) {
      activePlayer.status = STATUSES.BUSTED;
      advanceTurn();
    } else if (activePlayer.score === 21) {
      activePlayer.status = STATUSES.STOOD;
      advanceTurn();
    } else {
      activePlayer.status = STATUSES.PLAYING; // Let them hit or stand again
    }

    broadcastState();
  } 
  else if (state.phase === PHASES.DEALER_TURN) {
    if (!state.dealerReveal) {
      // First deck touch flips dealer's face-down card
      state.dealerReveal = true;
      state.dealerScore = calculateScore(state.dealerCards);

      // If dealer score is 17 or higher, stand immediately
      if (state.dealerScore >= 17) {
        resolveGame();
      } else {
        broadcastState();
      }
    } else {
      // Subsequent touches deal a card to dealer (dealer stands on 17 or higher)
      if (state.dealerScore < 17) {
        const card = state.deck.pop();
        state.dealerCards.push(card);
        state.dealerScore = calculateScore(state.dealerCards);

        if (state.dealerScore >= 17) {
          resolveGame();
        } else {
          broadcastState();
        }
      }
    }
  }
}

/**
 * Process end-of-round results, distribute wins, and update db
 */
function resolveGame() {
  state.phase = PHASES.RESOLVED;

  const dScore = state.dealerScore;
  const dCount = state.dealerCards.length;
  const dIsBusted = dScore > 21;
  const dHasBJ = isNaturalBlackjack(state.dealerCards);

  state.players.forEach(p => {
    let result = 'lose'; // 'win', 'lose', 'push', 'blackjack_win'
    let multiplier = 0; // Payout multiplier (excluding bet refund)
    
    const pScore = p.score;
    const pHasBJ = p.status === STATUSES.BLACKJACK;
    const pIsBusted = p.status === STATUSES.BUSTED;

    if (pIsBusted) {
      result = 'lose';
      multiplier = 0;
    } else if (pHasBJ) {
      if (dHasBJ) {
        result = 'push';
        multiplier = 1.0; // Return bet
      } else {
        result = 'blackjack_win';
        multiplier = 2.5; // Return bet + 1.5 * bet = 2.5x total
      }
    } else { // Stood
      if (dIsBusted) {
        result = 'win';
        multiplier = 2.0; // Return bet + 1.0 * bet = 2.0x total
      } else if (dHasBJ) {
        result = 'lose';
        multiplier = 0;
      } else {
        if (pScore > dScore) {
          result = 'win';
          multiplier = 2.0;
        } else if (pScore === dScore) {
          result = 'push';
          multiplier = 1.0;
        } else {
          result = 'lose';
          multiplier = 0;
        }
      }
    }

    const payoutAmount = Math.floor(p.bet * multiplier);
    
    // Update player status text for display
    if (pIsBusted) {
      p.status = 'BUSTED';
    } else if (pHasBJ) {
      p.status = 'BLACKJACK';
    } else {
      p.status = result.toUpperCase() + ` (${pScore})`;
    }

    try {
      // Payouts
      if (payoutAmount > 0) {
        const balance = db.getUserBalance(p.id);
        db.updateBalance(p.id, balance + payoutAmount);
      }

      // Save transaction
      db.addTransaction(p.id, 'blackjack', p.bet, payoutAmount, {
        result: result,
        playerScore: pScore,
        playerCards: p.cards,
        dealerScore: dScore,
        dealerCards: state.dealerCards
      });
    } catch (err) {
      console.error(`Error saving payout/tx for player ${p.name}:`, err);
    }
  });

  broadcastState();
}

/**
 * Dealer broadcasts a notification to all players (e.g. "Place your bets!")
 */
function sendDealerNotification(message, type = 'info') {
  if (!io) return;
  io.to('blackjack').emit('blackjack-notification', { message, type });
}

/**
 * Broadcast simple message to dealer screen
 */
function broadcastNotification(message, type = 'info') {
  if (!io) return;
  io.to('blackjack_dealer').emit('blackjack-notification', { message, type });
}

/**
 * Return current state representation
 */
function getState() {
  return { ...state };
}

module.exports = {
  init,
  resetState,
  addJoinRequest,
  handleDealerResponse,
  removePlayer,
  handleDisconnect,
  updateBet,
  clearBet,
  startGame,
  handlePlayerHit,
  handlePlayerStand,
  handleDealerDealCard,
  sendDealerNotification,
  getState,
  PHASES,
  STATUSES
};
