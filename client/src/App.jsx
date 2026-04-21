import React, { useState, useEffect, useRef, useCallback } from 'react';
import socket from './socket';
import TopBar from './components/TopBar';
import RaceArena from './components/RaceArena';
import BettingPanel from './components/BettingPanel';
import RaceHistory from './components/RaceHistory';
import HorseSVGSymbols, { HORSE_CONFIGS, HorseSVG } from './components/HorseSVGSymbols';
import { sounds, unlockAudio } from './utils/sounds';

// ── Win overlay ───────────────────────────────────────────────────────────────
function WinOverlay({ amount, winner, onDismiss }) {
  const [displayAmount, setDisplayAmount] = useState(0);

  useEffect(() => {
    let frame = 0;
    const totalFrames = 50;
    const timer = setInterval(() => {
      frame++;
      setDisplayAmount(Math.floor((frame / totalFrames) * amount));
      if (frame >= totalFrames) { clearInterval(timer); setDisplayAmount(amount); }
    }, 25);
    return () => clearInterval(timer);
  }, [amount]);

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(14, 9, 6, 0.95)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <div style={{
        textAlign: 'center',
        background: 'linear-gradient(160deg, var(--bg-plum) 0%, var(--bg-card) 100%)',
        border: '1px solid var(--line-strong)',
        borderRadius: 'var(--radius-xl)',
        maxWidth: '340px', width: '88%', overflow: 'hidden',
        boxShadow: '0 0 60px rgba(212,163,92,0.2), 0 20px 60px rgba(0,0,0,0.8)',
      }}>
        <div style={{
          background: 'linear-gradient(90deg, rgba(232,148,55,0.2), rgba(212,163,92,0.4), rgba(232,148,55,0.2))',
          padding: '28px 16px 20px',
          borderBottom: '1px solid var(--line)',
        }}>
          <div style={{ fontSize: '3.5rem', lineHeight: 1, marginBottom: '8px' }}>🏆</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '2rem', color: 'var(--gold-bright)', fontVariationSettings: '"opsz" 144, "wght" 600' }}>
            You won!
          </div>
        </div>
        {winner && (
          <div style={{ padding: '16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <HorseSVG horseId={winner.id} width={48} height={30} />
            <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '1.3rem', color: 'var(--cream)' }}>
              {winner.name}
            </div>
          </div>
        )}
        <div style={{ padding: '20px 16px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--cream-dim)', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '6px' }}>Your Payout</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontVariationSettings: '"opsz" 144, "wght" 600', fontSize: '3rem', color: 'var(--forest)', lineHeight: 1 }}>
            +{displayAmount.toLocaleString()}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--cream-dim)', marginTop: '4px', letterSpacing: '0.2em' }}>COINS</div>
        </div>
        <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderTop: '1px solid var(--line)', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--cream-dim)', letterSpacing: '0.2em' }}>
          TAP ANYWHERE TO CONTINUE
        </div>
      </div>
    </div>
  );
}

// ── Lose overlay ──────────────────────────────────────────────────────────────
function LoseOverlay({ onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 2500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div onClick={onDismiss} style={{
      position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 1000,
      background: 'var(--bg-elevated)',
      border: '1px solid rgba(215,67,67,0.3)',
      borderRadius: 'var(--radius-lg)',
      padding: '14px 24px',
      textAlign: 'center',
      cursor: 'pointer',
      fontFamily: 'var(--font-serif)',
      fontStyle: 'italic',
      fontSize: '1.1rem',
      color: 'var(--cream)',
    }}>
      😔 Better luck next time
    </div>
  );
}

// ── Bottom Nav ────────────────────────────────────────────────────────────────
function BottomNav({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'winners', label: 'Winners', icon: (
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 2v2c0 2.8 2.2 5 5 5v5H7l5 5 5-5h-3V9c2.8 0 5-2.2 5-5V2H5z"/></svg>
    )},
    { id: 'arena', label: 'Arena', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="10" ry="6"/><ellipse cx="12" cy="12" rx="6" ry="3"/></svg>
    )},
    { id: 'stats', label: 'Stats', icon: (
      <svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="6" width="4" height="15"/><rect x="17" y="9" width="4" height="12"/></svg>
    )},
  ];
  return (
    <div className="bottom-nav">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`nav-item${activeTab === tab.id ? ' active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.icon}
          <div className="lbl">{tab.label}</div>
        </button>
      ))}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [connected, setConnected]         = useState(false);
  const [gameState, setGameState]         = useState('betting');
  const [timeLeft, setTimeLeft]           = useState(40);
  const [horses, setHorses]               = useState([]);
  const [lastWinner, setLastWinner]       = useState(null);
  const [raceHistory, setRaceHistory]     = useState([]);
  const [raceStartTime, setRaceStartTime] = useState(null);
  const [raceHash, setRaceHash]           = useState(null);
  const [betStats, setBetStats]           = useState({});
  const [rainEnabled, setRainEnabled]     = useState(false);
  const [currentMarket, setCurrentMarket] = useState(null);
  const [raceInfo, setRaceInfo]           = useState(null);
  const [horsePositions, setHorsePositions] = useState({});
  const raceAnimRef = useRef(null);
  const raceInfoRef = useRef(null);
  const [balance, setBalance]             = useState(1000);
  const [selectedHorse, setSelectedHorse] = useState(null);
  const [betAmount, setBetAmount]         = useState(50);
  const [activeBet, setActiveBet]         = useState(null);
  const [screen, setScreen]               = useState('home');
  const [activeTab, setActiveTab]         = useState('winners');
  const [activeTrack, setActiveTrack]     = useState('dirt');
  const [winOverlay, setWinOverlay]       = useState(null);
  const [loseOverlay, setLoseOverlay]     = useState(false);
  const [notification, setNotification]   = useState(null);
  const notifTimer = useRef(null);
  const prevTimeLeft = useRef(timeLeft);

  const showNotif = useCallback((type, msg) => {
    if (notifTimer.current) clearTimeout(notifTimer.current);
    setNotification({ type, msg });
    notifTimer.current = setTimeout(() => setNotification(null), 3000);
  }, []);

  // ── Race animation ──────────────────────────────────────────────────────────
  const startRaceAnimation = useCallback((winnerHorse, allHorses, serverRaceStartTime) => {
    if (raceAnimRef.current) cancelAnimationFrame(raceAnimRef.current);
    raceInfoRef.current = { winnerHorse, allHorses, serverRaceStartTime };
    const T = 15;
    const tick = () => {
      const now = Date.now();
      const { winnerHorse: winner, allHorses: aHorses, serverRaceStartTime: startTs } = raceInfoRef.current || {};
      if (!winner || !aHorses) return;
      const elapsed = (now - startTs) / 1000;
      const positions = {};
      aHorses.forEach(h => {
        const isWinner = h.id === winner.id;
        positions[h.id] = isWinner
          ? Math.min((elapsed / T) * 100, 100)
          : Math.min((elapsed / T) * 85 + Math.sin(elapsed * 2 + h.id) * 3, 98);
        positions[h.id] = Math.max(0, positions[h.id]);
      });
      setHorsePositions(positions);
      if (elapsed < T + 0.5) raceAnimRef.current = requestAnimationFrame(tick);
    };
    raceAnimRef.current = requestAnimationFrame(tick);
  }, []);

  const stopRaceAnimation = useCallback(() => {
    if (raceAnimRef.current) { cancelAnimationFrame(raceAnimRef.current); raceAnimRef.current = null; }
  }, []);

  // ── Socket events ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onInteract = () => { unlockAudio(); };
    document.addEventListener('click', onInteract, { once: true });
    document.addEventListener('touchstart', onInteract, { once: true });

    socket.on('connect', () => { setConnected(true); socket.emit('join'); });
    socket.on('disconnect', () => setConnected(false));

    socket.on('game_state', (data) => {
      setGameState(data.state);
      setTimeLeft(data.timeLeft);
      setHorses(data.horses || []);
      if (data.lastWinner) setLastWinner(data.lastWinner);
      if (data.raceHistory) setRaceHistory(data.raceHistory);
      if (data.betStats) setBetStats(data.betStats);
      if (data.currentHash) setRaceHash(data.currentHash);
      if (data.raceStartTime) setRaceStartTime(data.raceStartTime);
      if (typeof data.rainEnabled !== 'undefined') setRainEnabled(data.rainEnabled);
      if (data.state === 'betting') {
        setHorsePositions({});
        setRaceInfo(null);
        stopRaceAnimation();
        setScreen('home');
      }
    });

    socket.on('race_market_created', (data) => setCurrentMarket(data));
    socket.on('race_hash', (data) => setRaceHash(data.hash));

    socket.on('race_start', (data) => {
      setRaceInfo(data);
      setRaceStartTime(data.raceStartTime);
      setHorsePositions({});
      setScreen('race');
      try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) {}
      sounds.startGun();
      startRaceAnimation(data.winnerHorse, data.horses, data.raceStartTime);
      setTimeout(() => sounds.hooves(0.5), 500);
      setTimeout(() => sounds.hooves(0.7), 2000);
      setTimeout(() => sounds.crowd(0.6), 4000);
      setTimeout(() => sounds.hooves(0.9), 8000);
      setTimeout(() => sounds.crowd(1.0), 12000);
    });

    socket.on('race_result', (data) => {
      stopRaceAnimation();
      setLastWinner(data.winner);
      setRaceHistory(prev => [data.winner, ...prev].slice(0, 10));
      if (data.payout) {
        if (data.payout.won) {
          try { if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 300]); } catch (e) {}
          sounds.win();
          setWinOverlay({ amount: data.payout.amount, winner: data.winner });
        } else {
          sounds.lose();
          setLoseOverlay(true);
        }
      }
      setActiveBet(null);
    });

    socket.on('race_reveal', (data) => {
      showNotif('info', `🔍 Verify: sha256(${data.seed.substring(0, 12)}…) = ${data.hash.substring(0, 8)}…`);
    });
    socket.on('balance_update', (data) => setBalance(data.balance));
    socket.on('bet_confirmed', (data) => {
      setActiveBet(data);
      sounds.betPlaced();
      showNotif('success', data.onChain
        ? `🌧️ On-chain bet: ${data.amount} USDT on horse #${data.horseId}`
        : `✅ Bet placed on horse #${data.horseId} — ${data.amount} coins`);
    });
    socket.on('bet_error', (data) => showNotif('error', `❌ ${data.message}`));
    socket.on('bet_stats_update', (data) => setBetStats(data.betStats));

    return () => {
      ['connect','disconnect','game_state','race_hash','race_start','race_result','race_reveal','balance_update','bet_confirmed','bet_error','bet_stats_update','race_market_created']
        .forEach(e => socket.off(e));
      stopRaceAnimation();
    };
  }, []);

  useEffect(() => {
    if (gameState === 'betting' && timeLeft <= 5 && timeLeft > 0 && activeBet) setScreen('race');
  }, [timeLeft, gameState, activeBet]);

  useEffect(() => {
    if (gameState === 'betting' && timeLeft <= 10 && timeLeft > 0 && timeLeft !== prevTimeLeft.current) {
      sounds.tick();
    }
    prevTimeLeft.current = timeLeft;
  }, [timeLeft, gameState]);

  const handlePlaceBet = useCallback(() => {
    if (!selectedHorse) { showNotif('error', '❌ Select a horse first!'); return; }
    if (betAmount <= 0 || betAmount > balance) { showNotif('error', '❌ Invalid bet amount.'); return; }
    socket.emit('place_bet', { horseId: selectedHorse, amount: betAmount });
  }, [selectedHorse, betAmount, balance, showNotif]);

  const bettingOpen = gameState === 'betting' && timeLeft > 0;

  // Race hash short
  const raceId = raceHash ? raceHash.substring(0, 8) : null;

  return (
    <div className="page" onClick={() => unlockAudio()}>
      {/* Inject SVG symbols */}
      <HorseSVGSymbols />

      {/* Overlays */}
      {winOverlay && <WinOverlay amount={winOverlay.amount} winner={winOverlay.winner} onDismiss={() => setWinOverlay(null)} />}
      {loseOverlay && <LoseOverlay onDismiss={() => setLoseOverlay(false)} />}

      {/* Toast notification */}
      {notification && (
        <div style={{
          position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 500, padding: '10px 20px', borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.75rem',
          letterSpacing: '0.05em',
          background:
            notification.type === 'error'   ? 'rgba(215,67,67,0.95)' :
            notification.type === 'success' ? 'rgba(90,145,104,0.95)' :
            'rgba(58,36,25,0.97)',
          color: 'var(--cream)',
          border: '1px solid var(--line-strong)',
          maxWidth: '90vw', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          pointerEvents: 'none',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {notification.msg}
        </div>
      )}

      <div className="stage">
        <div className="phone">
          {/* Connection warning (from TopBar) */}
          <TopBar
            balance={balance}
            gameState={gameState}
            timeLeft={timeLeft}
            connected={connected}
            raceHash={raceHash}
            rainEnabled={rainEnabled}
            currentMarketId={currentMarket?.marketId}
          />

          {/* ── HOME SCREEN ── */}
          {screen === 'home' && (
            <>
              {/* App Header */}
              <div className="app-header">
                <div className="brand">
                  <div className="brand-mark">The Arena</div>
                  <div className="brand-sub">Racing Club · Est. MMXXV</div>
                </div>
                <div className="balance-chip">
                  <div className="balance-label">Balance</div>
                  <div className="balance-amount">
                    <sup>$</sup>{balance.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="divider-ornate">
                <div className="line"></div>
                <div className="mark">❦</div>
                <div className="line"></div>
              </div>

              {/* Scrollable content */}
              <div style={{ overflowY: 'auto', paddingBottom: '80px' }}>
                <BettingPanel
                  horses={horses}
                  gameState={gameState}
                  timeLeft={timeLeft}
                  bettingOpen={bettingOpen}
                  selectedHorse={selectedHorse}
                  setSelectedHorse={setSelectedHorse}
                  betAmount={betAmount}
                  setBetAmount={setBetAmount}
                  activeBet={activeBet}
                  balance={balance}
                  onPlaceBet={handlePlaceBet}
                  betStats={betStats}
                  rainEnabled={rainEnabled}
                  currentMarket={currentMarket}
                  activeTrack={activeTrack}
                  setActiveTrack={setActiveTrack}
                />

                {/* Recent Winners strip */}
                {activeTab === 'winners' && raceHistory.length > 0 && (
                  <div className="winners-strip">
                    <div className="winners-head">
                      <div className="label">Recent winners</div>
                      <div className="meta">LAST {raceHistory.length} RACES</div>
                    </div>
                    <div className="winners-list">
                      {raceHistory.map((winner, i) => (
                        <div key={i} className={`winner-pill${i === 0 ? ' featured' : ''}`}>
                          <div className={`winner-badge${i === 0 ? ' first' : ` c${winner.id}`}`}>
                            {i === 0 ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M5 2v2c0 2.8 2.2 5 5 5v5H7l5 5 5-5h-3V9c2.8 0 5-2.2 5-5V2H5z"/>
                              </svg>
                            ) : winner.id}
                          </div>
                          <div className="winner-name">{winner.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Nav */}
              <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: '440px', margin: '0 auto' }}>
                <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
              </div>
            </>
          )}

          {/* ── RACE SCREEN ── */}
          {screen === 'race' && (
            <>
              {/* App Header */}
              <div className="app-header">
                <div className="brand">
                  <div className="brand-mark">The Arena</div>
                  <div className="brand-sub">Race in progress · {activeTrack.charAt(0).toUpperCase() + activeTrack.slice(1)} Track</div>
                </div>
                <div className="balance-chip">
                  <div className="balance-label">Balance</div>
                  <div className="balance-amount">
                    <sup>$</sup>{balance.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="divider-ornate">
                <div className="line"></div>
                <div className="mark">❦</div>
                <div className="line"></div>
              </div>

              <div style={{ overflowY: 'auto', paddingBottom: '80px' }}>
                <RaceArena
                  horses={horses}
                  gameState={gameState}
                  horsePositions={horsePositions}
                  raceInfo={raceInfo}
                  lastWinner={lastWinner}
                  activeBet={activeBet}
                  raceStartTime={raceStartTime}
                  activeTrack={activeTrack}
                />
              </div>

              {/* Bottom Nav */}
              <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: '440px', margin: '0 auto' }}>
                <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}