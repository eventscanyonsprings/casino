const fs = require('fs');
const path = require('path');
const config = require('./config');

const DB_PATH = path.join(__dirname, 'db.json');

let data = null;

function getData() {
  if (!data) {
    loadData();
  }
  return data;
}

function loadData() {
  if (!fs.existsSync(DB_PATH)) {
    // Initialize with empty data
    data = {
      users: [],
      transactions: [],
      next_user_id: 1,
      next_tx_id: 1
    };
    saveData();
    return;
  }
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  data = JSON.parse(raw);
  // Ensure auto-increment counters exist
  if (data.next_user_id === undefined) {
    data.next_user_id = data.users.length ? Math.max(...data.users.map(u => u.id)) + 1 : 1;
  }
  if (data.next_tx_id === undefined) {
    data.next_tx_id = data.transactions.length ? Math.max(...data.transactions.map(t => t.id)) + 1 : 1;
  }
}

function saveData() {
  // Sort data before writing for consistency
  data.users.sort((a, b) => a.id - b.id);
  data.transactions.sort((a, b) => a.id - b.id);
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getOrCreateUser(identifier) {
  const d = getData();
  let user = d.users.find(u => u.identifier === identifier);

  if (!user) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    user = {
      id: d.next_user_id++,
      identifier,
      username: null,
      unit_number: null,
      balance: config.starting_credits,
      created_at: now,
      last_seen: now
    };
    d.users.push(user);
    saveData();
  } else {
    // Update last_seen
    user.last_seen = new Date().toISOString().replace('T', ' ').slice(0, 19);
    saveData();
  }

  return user;
}

function getUserBalance(userId) {
  const d = getData();
  const user = d.users.find(u => u.id === userId);
  return user ? user.balance : null;
}

function updateBalance(userId, newBalance) {
  const d = getData();
  const user = d.users.find(u => u.id === userId);
  if (user) {
    user.balance = newBalance;
    saveData();
  }
}

function addTransaction(userId, gameType, betAmount, winAmount, details = null) {
  const d = getData();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  d.transactions.push({
    id: d.next_tx_id++,
    user_id: userId,
    game_type: gameType,
    bet_amount: betAmount,
    win_amount: winAmount,
    details: details ? JSON.stringify(details) : null,
    created_at: now
  });

  saveData();
}

function getRecentTransactions(userId, limit = 20) {
  const d = getData();
  return d.transactions
    .filter(t => t.user_id === userId)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);
}

function registerUser(userId, username, unitNumber) {
  const d = getData();
  const user = d.users.find(u => u.id === userId);
  if (!user) {
    throw new Error('User not found');
  }
  user.username = username;
  user.unit_number = unitNumber;
  saveData();
  return user;
}

function clearDb() {
  data = {
    users: [],
    transactions: [],
    next_user_id: 1,
    next_tx_id: 1
  };
  saveData();
  console.log('Database cleared.');
}

module.exports = {
  getData,
  getOrCreateUser,
  getUserBalance,
  updateBalance,
  addTransaction,
  getRecentTransactions,
  registerUser,
  clearDb
};
