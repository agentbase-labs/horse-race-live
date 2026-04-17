const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3001;

// ─── Horse definitions ────────────────────────────────────────────────────────
const HORSES = [
  { id: 1, name: 'Thunder', w: 35, color: '#e74c3c' },
  { id: 2, name: 'Storm',   w: 25, color: '#3498db' },
  { id: 3, name: 'Blaze',   w: 20, color: '#f39c12' },
  { id: 4, name: 'Shadow',  w: 12, color: '#ffffff' },
  { id: 5, name: 'Lucky',   w:  8, color: '#2c2c2c' },
];
const TOTAL_WEIGHT = HORSES.reduce((s, h) => s + h.w, 0); // 100

function calcOdds(horse) {
  return parseFloat(((TOTAL_WEIGHT / horse.w) * (1 - 0.1)).toFixed(2));
}

function horsesWithOdds() {
  return HORSES.map(h => ({ ...h, odds: calcOdds(h) }));
}

// ─── Weighted RNG with seed ───────────────────────────────────────────────────
function pickWinnerFromSeed(seed) {
  // Deterministic winner from seed: hash the seed to get a number
  const hash = crypto.createHash('sha256').update(seed + '_winner').digest('hex');
  // Use first 8 hex chars as a number 0-FFFFFFFF
  const rand = parseInt(hash.substring(0, 8), 16) / 0xFFFFFFFF * TOTAL_WEIGHT;
  let remaining = rand;
  for (const h of HORSES) {
    remaining -= h.w;
    if (remaining <= 0) return h;
  }
  return HORSES[HORSES.length - 1];
}

// ─── Provably Fair ────────────────────────────────────────────────────────────
let currentSeed = null;
let currentHash = null;

function generateProvablyFairSeed() {
  const seed = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  currentSeed = seed;
  currentHash = hash;
  return { seed, hash };
}

// ─── In-memory state ──────────────────────────────────────────────────────────
/** @type {Map<string, {balance: number, bet: {horseId: number, amount: number} | null}>} */
const users = new Map();

const raceHistory = []; // last 10 winners

// ─── Bet stats for popularity bars ───────────────────────────────────────────
const betStats = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; // total bet amounts per horse

function getBetStats() {
  const total = Object.values(betStats).reduce((a, b) => a + b, 0);
  const stats = {};
  HORSES.forEach(h => {
    stats[h.id] = total > 0 ? Math.round((betStats[h.id] / total) * 100) : 20;
  });
  return stats;
}

function resetBetStats() {
  HORSES.forEach(h => { betStats[h.id] = 0; });
}

// ─── Game Loop State Machine ──────────────────────────────────────────────────
const STATES = {
  BETTING:     { name: 'betting',     duration: 40 },
  CALCULATION: { name: 'calculation', duration: 1  },
  RACE:        { name: 'race',        duration: 15 },
  RESULTS:     { name: 'results',     duration: 4  },
};

let gameState = {
  state: STATES.BETTING.name,
  timeLeft: STATES.BETTING.duration,
  horses: horsesWithOdds(),
  lastWinner: null,
  currentWinner: null,
  serverTime: Date.now(),
  raceStartTime: null,
  currentHash: null,
};

let gameInterval = null;

// Generate first seed immediately
generateProvablyFairSeed();
gameState.currentHash = currentHash;

function transitionTo(stateName) {
  const stateObj = Object.values(STATES).find(s => s.name === stateName);
  gameState.state    = stateObj.name;
  gameState.timeLeft = stateObj.duration;
  gameState.serverTime = Date.now();
}

function broadcastGameState() {
  const payload = {
    state:         gameState.state,
    timeLeft:      gameState.timeLeft,
    horses:        gameState.horses,
    lastWinner:    gameState.lastWinner,
    serverTime:    gameState.serverTime,
    raceStartTime: gameState.raceStartTime,
    currentHash:   gameState.currentHash,
    betStats:      getBetStats(),
  };
  io.emit('game_state', payload);
}

function settleRace(winner) {
  const payouts = {};

  users.forEach((user, socketId) => {
    if (user.bet) {
      if (user.bet.horseId === winner.id) {
        const winnings = Math.floor(user.bet.amount * winner.odds);
        user.balance += winnings;
        payouts[socketId] = { won: true, amount: winnings };
      } else {
        payouts[socketId] = { won: false, amount: 0 };
      }
      user.bet = null; // clear bet for next round
    }
  });

  // emit individual balance updates + race_result to each socket
  users.forEach((user, socketId) => {
    const sock = io.sockets.sockets.get(socketId);
    if (!sock) return;

    const payout = payouts[socketId] || null;
    sock.emit('race_result', {
      winner,
      payout,
    });
    sock.emit('balance_update', { balance: user.balance });
  });

  // Reveal seed after race completes
  io.emit('race_reveal', {
    seed: currentSeed,
    hash: currentHash,
    winnerId: winner.id,
  });
}

function startGameLoop() {
  if (gameInterval) clearInterval(gameInterval);

  gameInterval = setInterval(() => {
    gameState.timeLeft--;
    gameState.serverTime = Date.now();

    // ── State transitions ──────────────────────────────────────────────────
    if (gameState.state === STATES.BETTING.name) {
      if (gameState.timeLeft <= 0) {
        transitionTo(STATES.CALCULATION.name);
        // Pick winner deterministically from seed
        const winner = pickWinnerFromSeed(currentSeed);
        gameState.currentWinner = { ...winner, odds: calcOdds(winner) };
      }

    } else if (gameState.state === STATES.CALCULATION.name) {
      if (gameState.timeLeft <= 0) {
        transitionTo(STATES.RACE.name);
        gameState.raceStartTime = Date.now();
        // Broadcast race_start
        io.emit('race_start', {
          winnerHorse: gameState.currentWinner,
          horses: gameState.horses,
          raceTime: STATES.RACE.duration,
          raceStartTime: gameState.raceStartTime,
        });
      }

    } else if (gameState.state === STATES.RACE.name) {
      if (gameState.timeLeft <= 0) {
        transitionTo(STATES.RESULTS.name);
        gameState.raceStartTime = null;
        // Update lastWinner
        gameState.lastWinner = gameState.currentWinner;
        // Add to history (keep last 10)
        raceHistory.unshift(gameState.currentWinner);
        if (raceHistory.length > 10) raceHistory.pop();
        // Settle bets
        settleRace(gameState.currentWinner);
      }

    } else if (gameState.state === STATES.RESULTS.name) {
      if (gameState.timeLeft <= 0) {
        // Generate new seed for next round
        generateProvablyFairSeed();
        gameState.currentHash = currentHash;
        // Broadcast the hash for next race
        io.emit('race_hash', { hash: currentHash });
        // Reset bet stats for next round
        resetBetStats();
        // Reset for next round
        gameState.currentWinner = null;
        transitionTo(STATES.BETTING.name);
      }
    }

    broadcastGameState();
  }, 1000);
}

// ─── Socket.io handlers ───────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // Register user
  users.set(socket.id, { balance: 1000, bet: null });

  // Handle join — send complete current game state for reconnect recovery
  socket.on('join', () => {
    const user = users.get(socket.id);
    socket.emit('game_state', {
      state:         gameState.state,
      timeLeft:      gameState.timeLeft,
      horses:        gameState.horses,
      lastWinner:    gameState.lastWinner,
      raceHistory,
      serverTime:    Date.now(),
      raceStartTime: gameState.raceStartTime,
      currentHash:   gameState.currentHash,
      betStats:      getBetStats(),
    });
    socket.emit('balance_update', { balance: user.balance });

    // If race is ongoing, also send race_start so client can animate correctly
    if (gameState.state === 'race' && gameState.currentWinner) {
      socket.emit('race_start', {
        winnerHorse:   gameState.currentWinner,
        horses:        gameState.horses,
        raceTime:      STATES.RACE.duration,
        raceStartTime: gameState.raceStartTime,
      });
    }

    // Broadcast current hash during betting phase
    if (gameState.state === 'betting' && currentHash) {
      socket.emit('race_hash', { hash: currentHash });
    }

    console.log(`[join] ${socket.id} — balance: ${user.balance}`);
  });

  // Handle place_bet
  socket.on('place_bet', ({ horseId, amount }) => {
    const user = users.get(socket.id);
    if (!user) return;

    // Lock bets during non-betting phase or when timeLeft <= 0
    if (gameState.state !== 'betting' || gameState.timeLeft <= 0) {
      socket.emit('bet_error', { message: 'Betting is closed.' });
      return;
    }

    const betAmount = parseInt(amount, 10);
    if (isNaN(betAmount) || betAmount <= 0) {
      socket.emit('bet_error', { message: 'Invalid bet amount.' });
      return;
    }
    if (betAmount > user.balance) {
      socket.emit('bet_error', { message: 'Insufficient balance.' });
      return;
    }
    const horse = HORSES.find(h => h.id === horseId);
    if (!horse) {
      socket.emit('bet_error', { message: 'Invalid horse.' });
      return;
    }

    // Deduct amount immediately (returned if win)
    user.balance -= betAmount;
    user.bet = { horseId, amount: betAmount };

    // Update bet stats
    betStats[horseId] = (betStats[horseId] || 0) + betAmount;

    socket.emit('bet_confirmed', { horseId, amount: betAmount });
    socket.emit('balance_update', { balance: user.balance });

    // Broadcast updated bet stats to all
    io.emit('bet_stats_update', { betStats: getBetStats() });

    console.log(`[bet] ${socket.id} bet ${betAmount} on horse ${horseId}`);
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    console.log(`[disconnect] ${socket.id}`);
  });
});

// ─── HTTP endpoints ───────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    game: gameState.state,
    timeLeft: gameState.timeLeft,
    connectedUsers: users.size,
  });
});

app.get('/history', (req, res) => {
  res.json({ raceHistory });
});

// ─── Serve static frontend ────────────────────────────────────────────────────
const path = require('path');
const publicDir = path.join(__dirname, 'public');
if (require('fs').existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
} else {
  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      game: gameState.state,
      timeLeft: gameState.timeLeft,
      connectedUsers: users.size,
    });
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🏇 Horse Race server running on http://localhost:${PORT}`);
  startGameLoop();
});