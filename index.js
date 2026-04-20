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

// ─── Rain Protocol SDK ─────────────────────────────────────────────────────────
let rain = null;
let rainEnabled = false;
let resolverWallet = null;

try {
  const { Rain } = require('@buidlrrr/rain-sdk');
  const { createWalletClient, http: viemHttp, createPublicClient } = require('viem');
  const { privateKeyToAccount } = require('viem/accounts');
  const { arbitrum } = require('viem/chains');

  if (process.env.RESOLVER_PRIVATE_KEY) {
    resolverWallet = privateKeyToAccount(process.env.RESOLVER_PRIVATE_KEY);
    rain = new Rain({ environment: 'production' });

    const walletClient = createWalletClient({
      account: resolverWallet,
      chain: arbitrum,
      transport: viemHttp(process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'),
    });

    rain._walletClient = walletClient;
    rain._publicClient = createPublicClient({
      chain: arbitrum,
      transport: viemHttp(process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'),
    });

    rainEnabled = true;
    console.log('🌧️  Rain Protocol SDK initialized, resolver:', resolverWallet.address);
  } else {
    console.log('⚠️  RESOLVER_PRIVATE_KEY not set — Rain SDK disabled, running in demo mode');
  }
} catch (e) {
  console.log('⚠️  Rain SDK not available, running in demo mode:', e.message);
}

// ─── Horse definitions ────────────────────────────────────────────────────────
const HORSES = [
  { id: 1, name: 'Oded',  w: 30, color: '#e74c3c' },
  { id: 2, name: 'Shon',  w: 22, color: '#3498db' },
  { id: 3, name: 'Joy',   w: 18, color: '#f39c12' },
  { id: 4, name: 'Naya',  w: 12, color: '#ffffff' },
  { id: 5, name: 'Lai',   w:  8, color: '#2c2c2c' },
  { id: 6, name: 'Hadar', w: 10, color: '#9b59b6' },
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

// ─── Rain Market State ────────────────────────────────────────────────────────
let currentRaceNumber = 0;
let currentMarket = null; // { marketId, contractAddress, options, txHash }
let marketCreationPending = false;

async function createRainMarket(raceNumber) {
  if (!rainEnabled || !rain || !resolverWallet) {
    console.log(`[rain] Demo mode — skipping market creation for race #${raceNumber}`);
    // Return a mock market for demo mode
    return {
      marketId: `demo-${raceNumber}`,
      contractAddress: '0x0000000000000000000000000000000000000000',
      options: HORSES.map((h, i) => ({
        id: i + 1,
        name: h.name,
        odds: calcOdds(h),
      })),
      isDemoMarket: true,
    };
  }

  try {
    console.log(`[rain] Creating market for race #${raceNumber}...`);

    const now = Math.floor(Date.now() / 1000);
    const txList = await rain.buildCreateMarketTx({
      marketQuestion: `Race #${raceNumber}: Who will win?`,
      marketOptions: HORSES.map(h => h.name),
      marketTags: ['racing', 'horse-race'],
      isPublic: true,
      isPublicPoolResolverAi: false,
      creator: resolverWallet.address,
      startTime: BigInt(now + 60),
      endTime: BigInt(now + 300),
      no_of_options: 5n,
      inputAmountWei: 10_000_000n, // 10 USDT initial liquidity
      barValues: [35, 25, 20, 12, 8], // initial odds matching horse weights
      baseToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      tokenDecimals: 6,
    });

    // Execute transactions
    let lastTxHash = null;
    let marketId = null;
    let contractAddress = null;

    for (const tx of txList) {
      const hash = await rain._walletClient.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value || 0n,
      });
      lastTxHash = hash;
      console.log(`[rain] Tx sent: ${hash}`);

      // Wait for receipt
      const receipt = await rain._publicClient.waitForTransactionReceipt({ hash });
      console.log(`[rain] Tx confirmed in block ${receipt.blockNumber}`);

      // Extract market info from logs if available
      if (receipt.logs && receipt.logs.length > 0) {
        // The last log from contract creation should have market address
        const lastLog = receipt.logs[receipt.logs.length - 1];
        if (lastLog.address && !contractAddress) {
          contractAddress = lastLog.address;
        }
        // Try to extract marketId from logs
        for (const log of receipt.logs) {
          if (log.topics && log.topics[1]) {
            // marketId is often in the second topic
            try {
              marketId = BigInt(log.topics[1]).toString();
            } catch (e) {}
          }
        }
      }
    }

    // Use tx hash as fallback marketId if not found from logs
    if (!marketId) marketId = lastTxHash;
    if (!contractAddress) contractAddress = '0x' + lastTxHash.substring(2, 42);

    const market = {
      marketId,
      contractAddress,
      txHash: lastTxHash,
      options: HORSES.map((h, i) => ({
        id: i + 1,
        name: h.name,
        odds: calcOdds(h),
      })),
      isDemoMarket: false,
    };

    console.log(`[rain] Market created: ${marketId} at ${contractAddress}`);
    return market;
  } catch (e) {
    console.error('[rain] Failed to create market:', e.message);
    // Fallback to demo market on error
    return {
      marketId: `fallback-${raceNumber}`,
      contractAddress: '0x0000000000000000000000000000000000000000',
      options: HORSES.map((h, i) => ({
        id: i + 1,
        name: h.name,
        odds: calcOdds(h),
      })),
      isDemoMarket: true,
      error: e.message,
    };
  }
}

async function resolveRainMarket(marketId, winnerIndex) {
  if (!rainEnabled || !rain || !resolverWallet) {
    console.log(`[rain] Demo mode — skipping market resolve for ${marketId}`);
    return;
  }
  if (!marketId || marketId.startsWith('demo-') || marketId.startsWith('fallback-')) {
    console.log(`[rain] Skipping resolve for demo/fallback market: ${marketId}`);
    return;
  }

  try {
    console.log(`[rain] Resolving market ${marketId} with winner option ${winnerIndex + 1}...`);

    const txList = await rain.buildResolveMarketTx({
      marketId,
      winningOption: winnerIndex + 1, // 1-indexed!
    });

    for (const tx of txList) {
      const hash = await rain._walletClient.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value || 0n,
      });
      console.log(`[rain] Resolve tx sent: ${hash}`);

      const receipt = await rain._publicClient.waitForTransactionReceipt({ hash });
      console.log(`[rain] Resolve tx confirmed in block ${receipt.blockNumber}`);
    }

    console.log(`[rain] Market ${marketId} resolved. Winner: option ${winnerIndex + 1} (${HORSES[winnerIndex].name})`);
  } catch (e) {
    console.error('[rain] Failed to resolve market:', e.message);
  }
}

// ─── In-memory state ──────────────────────────────────────────────────────────
/** @type {Map<string, {balance: number, bet: {horseId: number, amount: number} | null}>} */
const users = new Map();

const raceHistory = []; // last 10 winners

// ─── Bet stats for popularity bars ───────────────────────────────────────────
const betStats = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; // total bet amounts per horse

// Track on-chain bets: socketId -> { horseId, txHash, walletAddress }
const onChainBets = new Map();

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
  currentMarketId: null,
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
    // Rain market info
    currentMarketId:      gameState.currentMarketId,
    rainEnabled,
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

  // Create initial market for first betting phase
  currentRaceNumber++;
  (async () => {
    marketCreationPending = true;
    currentMarket = await createRainMarket(currentRaceNumber);
    gameState.currentMarketId = currentMarket.marketId;
    marketCreationPending = false;
    // Notify clients of market creation
    io.emit('race_market_created', {
      marketId: currentMarket.marketId,
      contractAddress: currentMarket.contractAddress,
      options: currentMarket.options,
      isDemoMarket: currentMarket.isDemoMarket,
      raceNumber: currentRaceNumber,
    });
    broadcastGameState();
    console.log(`[market] Race #${currentRaceNumber} market ready: ${currentMarket.marketId}`);
  })();

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
        // Settle bets (internal balance)
        settleRace(gameState.currentWinner);
        // Resolve Rain market (async, non-blocking)
        if (currentMarket && gameState.currentWinner) {
          const winnerHorseIndex = HORSES.findIndex(h => h.id === gameState.currentWinner.id);
          const marketIdToResolve = currentMarket.marketId;
          resolveRainMarket(marketIdToResolve, winnerHorseIndex)
            .then(() => {
              io.emit('market_resolved', {
                marketId: marketIdToResolve,
                winnerId: gameState.currentWinner.id,
                winnerName: gameState.currentWinner.name,
              });
            })
            .catch(e => console.error('[rain] Resolve error:', e.message));
        }
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
        onChainBets.clear();
        // Reset for next round
        gameState.currentWinner = null;
        transitionTo(STATES.BETTING.name);

        // Create new Rain market for next round
        currentRaceNumber++;
        const nextRaceNumber = currentRaceNumber;
        (async () => {
          marketCreationPending = true;
          currentMarket = await createRainMarket(nextRaceNumber);
          gameState.currentMarketId = currentMarket.marketId;
          marketCreationPending = false;
          io.emit('race_market_created', {
            marketId: currentMarket.marketId,
            contractAddress: currentMarket.contractAddress,
            options: currentMarket.options,
            isDemoMarket: currentMarket.isDemoMarket,
            raceNumber: nextRaceNumber,
          });
          broadcastGameState();
          console.log(`[market] Race #${nextRaceNumber} market ready: ${currentMarket.marketId}`);
        })();
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
      currentMarketId: gameState.currentMarketId,
      rainEnabled,
    });
    socket.emit('balance_update', { balance: user.balance });

    // Send current market info
    if (currentMarket) {
      socket.emit('race_market_created', {
        marketId: currentMarket.marketId,
        contractAddress: currentMarket.contractAddress,
        options: currentMarket.options,
        isDemoMarket: currentMarket.isDemoMarket,
        raceNumber: currentRaceNumber,
      });
    }

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

  // Handle place_bet (legacy / internal balance mode)
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

  // Handle on-chain bet confirmation (Rain Protocol)
  socket.on('confirm_onchain_bet', ({ horseId, txHash, walletAddress, amount }) => {
    const user = users.get(socket.id);
    if (!user) return;

    if (gameState.state !== 'betting' || gameState.timeLeft <= 0) {
      socket.emit('bet_error', { message: 'Betting is closed.' });
      return;
    }

    const horse = HORSES.find(h => h.id === horseId);
    if (!horse) {
      socket.emit('bet_error', { message: 'Invalid horse.' });
      return;
    }

    if (!txHash || !txHash.startsWith('0x')) {
      socket.emit('bet_error', { message: 'Invalid transaction hash.' });
      return;
    }

    // Record on-chain bet
    onChainBets.set(socket.id, {
      horseId,
      txHash,
      walletAddress,
      amount: amount || 0,
      confirmedAt: Date.now(),
    });

    // Also register as internal bet for race result tracking
    user.bet = { horseId, amount: amount || 0, onChain: true, txHash };

    // Update bet stats
    betStats[horseId] = (betStats[horseId] || 0) + (amount || 10);

    socket.emit('bet_confirmed', {
      horseId,
      amount: amount || 0,
      txHash,
      onChain: true,
    });

    // Broadcast updated bet stats to all
    io.emit('bet_stats_update', { betStats: getBetStats() });

    console.log(`[onchain-bet] ${socket.id} bet ${amount} USDT on horse ${horseId}, tx: ${txHash}`);
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    onChainBets.delete(socket.id);
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
    rainEnabled,
    currentMarketId: gameState.currentMarketId,
  });
});

app.get('/history', (req, res) => {
  res.json({ raceHistory });
});

app.get('/api/market', (req, res) => {
  res.json({
    currentMarket,
    raceNumber: currentRaceNumber,
    rainEnabled,
  });
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
      rainEnabled,
    });
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🏇 Horse Race (Rain Integration) server running on http://localhost:${PORT}`);
  startGameLoop();
});