import React, { useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useRainBet } from '../hooks/useRainBet';
import { HORSE_CONFIGS, HorseSVG } from './HorseSVGSymbols';

const QUICK_AMOUNTS = [5, 10, 25, 50, 100];

function getRainStepLabel(step) {
  switch (step) {
    case 'approving':  return '⏳ Approving USDT…';
    case 'buying':     return '⏳ Sending buy tx…';
    case 'confirming': return '⏳ Waiting for confirmation…';
    case 'done':       return '✅ On-chain bet confirmed!';
    default:           return null;
  }
}

// Ordinal suffix
function ordinal(n) {
  if (n === 1) return '1ST'; if (n === 2) return '2ND'; if (n === 3) return '3RD';
  return `${n}TH`;
}

export default function BettingPanel({
  horses,
  gameState,
  timeLeft,
  bettingOpen,
  selectedHorse,
  setSelectedHorse,
  betAmount,
  setBetAmount,
  activeBet,
  balance,
  onPlaceBet,
  betStats,
  rainEnabled,
  currentMarket,
  activeTrack,
  setActiveTrack,
}) {
  const isBetting = gameState === 'betting';
  const disabled  = !bettingOpen || !!activeBet;

  const { isConnected } = useAccount();
  const { placeBet: placeRainBet, isLoading: rainLoading, error: rainError, step: rainStep } = useRainBet();

  const [useOnChain, setUseOnChain] = useState(false);
  const [usdtAmount, setUsdtAmount] = useState(5);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const touchStartX = useRef(null);

  const totalHorses = horses.length || 5;
  const goPrev = () => setCarouselIndex(i => Math.max(0, i - 1));
  const goNext = () => setCarouselIndex(i => Math.min(totalHorses - 1, i + 1));
  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 40) goNext();
    else if (diff < -40) goPrev();
    touchStartX.current = null;
  };

  const heroHorse = horses[carouselIndex] || horses[0];
  const heroConfig = heroHorse ? (HORSE_CONFIGS[heroHorse.id] || HORSE_CONFIGS[1]) : null;
  const activeHorse = horses.find(h => h.id === selectedHorse);
  const payout = activeHorse && betAmount > 0 ? Math.floor(betAmount * activeHorse.odds) : null;
  const canRainBet = isConnected && rainEnabled && currentMarket && !currentMarket.isDemoMarket;
  const rainStepLabel = getRainStepLabel(rainStep);

  const handleSelectHorse = (horseId) => {
    // Allow selection even during betting phase, just not when a bet is already placed
    if (!activeBet) {
      setSelectedHorse(horseId);
      const idx = horses.findIndex(h => h.id === horseId);
      if (idx !== -1) setCarouselIndex(idx);
    }
  };

  const handlePlaceTrade = async () => {
    if (canRainBet && useOnChain) {
      await placeRainBet(selectedHorse, usdtAmount, currentMarket);
    } else {
      onPlaceBet();
    }
  };

  const tracks = [
    { id: 'dirt',    label: 'Dirt' },
    { id: 'asphalt', label: 'Asphalt' },
    { id: 'sand',    label: 'Sand' },
    { id: 'snow',    label: 'Snow' },
  ];

  return (
    <>
      {/* ── TIMER HERO ── */}
      <div className="timer-hero">
        <div className="timer-row-top">
          <div className="timer-label">Next Race Begins In</div>
          <div className="live-dot">
            <span className="dot"></span>
            {isBetting ? 'BETS OPEN' : gameState === 'race' ? 'RACING' : 'RESULTS'}
          </div>
        </div>
        <div className="timer-display">
          <div className="timer-number">
            {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
          </div>
          <div className="timer-caption">
            Race <span className="ornament">№</span> <strong style={{ color: 'var(--gold-bright)' }}>
              {typeof window !== 'undefined' ? Math.random().toString(36).slice(2, 10).toUpperCase() : '--------'}
            </strong><br/>
            <span style={{ opacity: 0.6 }}>5 horses racing</span>
          </div>
        </div>
        <div className="timer-progress">
          <div className="timer-progress-fill" style={{
            width: `${Math.max(0, (40 - timeLeft) / 40 * 100)}%`
          }}></div>
        </div>
      </div>

      {/* ── STEP 01: CHOOSE YOUR HORSE ── */}
      <div className="section-label">
        <div>
          <div className="eyebrow">Step 01</div>
          <div className="title">Choose your horse</div>
        </div>
        <div className="hint">{totalHorses} CONTENDERS</div>
      </div>

      {/* Horse Stage (carousel hero) — tap to select current horse */}
      <div
        className="horse-stage"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => heroHorse && handleSelectHorse(heroHorse.id)}
        style={{ cursor: 'pointer' }}
      >
        <button className="stage-arrow prev" onClick={(e) => { e.stopPropagation(); goPrev(); }} disabled={carouselIndex === 0}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <button className="stage-arrow next" onClick={(e) => { e.stopPropagation(); goNext(); }} disabled={carouselIndex === totalHorses - 1}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>

        {heroHorse && heroConfig && (
          <>
            <HorseSVG horseId={heroHorse.id} width={200} height={120} className="horse-svg" />
            <div className="horse-info">
              <div className="horse-name-block">
                <div className="horse-number">N° 0{heroHorse.id} · {
                  heroConfig.spots && heroConfig.spotColor === '#111111' ? 'SPOTTED BLACK' :
                  heroConfig.spots && heroConfig.spotColor === '#8D6E63' ? 'SPOTTED BROWN' :
                  heroConfig.coat === '#FFFFFF' || heroConfig.coat === '#ffffff' ? 'WHITE' :
                  heroConfig.coat === '#111111' ? 'BLACK' :
                  heroConfig.coat === '#5D4037' || heroConfig.coat === '#5d4037' ? 'DARK BROWN' :
                  heroConfig.coat === '#D7CCC8' || heroConfig.coat === '#d7ccc8' ? 'LIGHT BROWN' : 'BROWN'
                }</div>
                <div className="horse-name">{heroHorse.name}</div>
              </div>
              <div className="horse-odds">
                <div className="value">{heroHorse.odds}×</div>
                <div className="label">{betStats?.[heroHorse.id] ?? 20}% of pool</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Horse Thumbnails */}
      <div className="horse-thumbs">
        {horses.map((horse, i) => {
          const isActive = i === carouselIndex;
          const isSelected = selectedHorse === horse.id;
          return (
            <div
              key={horse.id}
              className={`thumb${isActive || isSelected ? ' active' : ''}`}
              onClick={() => { setCarouselIndex(i); handleSelectHorse(horse.id); }}
            >
              <HorseSVG horseId={horse.id} width={48} height={28} />
              <div className="num">{horse.name}</div>
            </div>
          );
        })}
      </div>

      {/* ── STEP 02: TERRAIN ── */}
      <div className="section-label">
        <div>
          <div className="eyebrow">Step 02</div>
          <div className="title">Pick the terrain</div>
        </div>
      </div>

      <div className="tracks-row">
        {tracks.map(t => (
          <div
            key={t.id}
            className={`track-card${activeTrack === t.id ? ' active' : ''}`}
            onClick={() => setActiveTrack(t.id)}
          >
            <div className={`track-preview ${t.id}`}></div>
            <div className="track-name">{t.label}</div>
          </div>
        ))}
      </div>

      {/* ── STEP 03: WAGER ── */}
      <div className="bet-section">
        <div className="section-label" style={{ padding: 0, margin: '20px 0 12px' }}>
          <div>
            <div className="eyebrow">Step 03</div>
            <div className="title">Set your wager</div>
          </div>
          {payout && (
            <div className="bet-potential">
              <div className="label">Potential win</div>
              <div className="value">{payout.toLocaleString()} coins</div>
            </div>
          )}
        </div>

        <div className="bet-header">
          <div className="bet-total">
            <span className="num">{betAmount}</span>
            <span className="unit">Coins</span>
          </div>
        </div>

        <div className="bet-chips">
          {QUICK_AMOUNTS.map(amt => (
            <button
              key={amt}
              className={`chip${betAmount === amt ? ' active' : ''}`}
              disabled={!!activeBet || amt > balance}
              onClick={(e) => { e.stopPropagation(); setBetAmount(amt); }}
            >{amt}</button>
          ))}
        </div>
      </div>

      {/* Rain toggle (only for connected wallets) */}
      {isConnected && canRainBet && (
        <div style={{
          margin: '0 20px 8px',
          padding: '10px 14px',
          background: 'var(--bg-card)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--cream-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
            {useOnChain ? '🌧️ ON-CHAIN (USDT)' : '🎮 DEMO MODE'}
          </div>
          <button
            onClick={() => setUseOnChain(v => !v)}
            style={{
              width: '44px', height: '24px', borderRadius: '12px', border: 'none',
              background: useOnChain ? 'var(--amber)' : 'rgba(255,255,255,0.12)',
              cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              position: 'absolute', top: '2px',
              left: useOnChain ? '22px' : '2px',
              width: '20px', height: '20px', borderRadius: '50%',
              background: '#fff', transition: 'left 0.2s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }} />
          </button>
        </div>
      )}

      {/* ── CTA ── */}
      <div className="cta-wrap">
        {activeBet ? (
          <div style={{
            background: 'linear-gradient(135deg, rgba(90,145,104,0.2), rgba(90,145,104,0.08))',
            border: '2px solid rgba(90,145,104,0.5)',
            borderRadius: 'var(--radius-lg)',
            padding: '18px',
            textAlign: 'center',
          }}>
            <div style={{ color: 'var(--forest)', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '1.2rem', marginBottom: '4px' }}>
              🏁 Race starting soon!
            </div>
            <div style={{ color: 'var(--cream-dim)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em' }}>
              {activeBet.amount} COINS · HORSE {activeBet.horseId}
            </div>
          </div>
        ) : (
          <>
            {rainLoading && rainStepLabel && (
              <div style={{ marginBottom: '10px', textAlign: 'center', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                {rainStepLabel}
              </div>
            )}
            {rainError && (
              <div style={{ marginBottom: '10px', textAlign: 'center', color: 'var(--crimson)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                ❌ {rainError}
              </div>
            )}
            <button
              className="cta"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!disabled && selectedHorse && !rainLoading) {
                  handlePlaceTrade();
                }
              }}
              style={{
                opacity: (disabled || !selectedHorse) ? 0.5 : 1,
                cursor: (disabled || !selectedHorse) ? 'not-allowed' : 'pointer',
                pointerEvents: 'all',
              }}
            >
              {useOnChain && canRainBet ? '🌧️ Place On-Chain Bet' : 'Start Race'}
              <span className="arrow">→</span>
            </button>
            {isBetting && timeLeft <= 10 && timeLeft > 0 && (
              <div style={{ textAlign: 'center', color: 'var(--crimson)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', marginTop: '8px', letterSpacing: '0.1em' }}>
                ⚠️ HURRY! {timeLeft}s LEFT
              </div>
            )}
          </>
        )}
        <div className="cta-sub">
          {selectedHorse ? `Betting on ${HORSE_CONFIGS[selectedHorse]?.name || `horse #${selectedHorse}`}` : 'Select a horse above'}
        </div>
      </div>
    </>
  );
}