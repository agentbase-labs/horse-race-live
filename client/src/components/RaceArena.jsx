import React, { useMemo, useState, useEffect, useRef } from 'react';
import { HORSE_CONFIGS, HorseSVG } from './HorseSVGSymbols';

// ── Position rank label ───────────────────────────────────────────────────────
function ordinalLabel(rank) {
  if (rank === 1) return '1ST';
  if (rank === 2) return '2ND';
  if (rank === 3) return '3RD';
  return `${rank}TH`;
}

// ── Single Race Lane ──────────────────────────────────────────────────────────
function RaceLane({ horse, pos, allPositions, isRacing, isResults, lastWinner, activeBet }) {
  const cfg = HORSE_CONFIGS[horse.id] || HORSE_CONFIGS[1];
  const isMine = activeBet?.horseId === horse.id;
  const isWinner = isResults && lastWinner?.id === horse.id;

  // Visual position: 5% to 85% of lane
  const sortedIds = Object.entries(allPositions)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .map(([id]) => parseInt(id));
  const rank = sortedIds.indexOf(horse.id) + 1 || 1;

  // In results: winner at 82%, others spread
  let visualLeft;
  if (isResults) {
    if (isWinner) {
      visualLeft = 82;
    } else {
      const maxPos = Math.max(...Object.values(allPositions).map(Number), 0.1);
      const normalized = Math.min(Number(pos), 90) / maxPos;
      visualLeft = 5 + normalized * 65;
    }
  } else {
    const maxPos = Math.max(...Object.values(allPositions).map(Number), 0.1);
    const normalized = Number(pos) / maxPos;
    visualLeft = 5 + normalized * 65;
  }

  // Lane color
  const laneColorClass = `c${horse.id}`;

  return (
    <div className="lane">
      <div className={`lane-num ${laneColorClass}`}>{horse.id}</div>

      <div
        className={`racer${isRacing ? ' running' : ''}${rank === 1 && isRacing ? ' lead' : ''}${isMine ? ' user' : ''}`}
        style={{ left: `calc(${visualLeft}% - 28px)`, transition: isRacing ? 'left 0.4s ease-out' : 'none' }}
      >
        {/* Position tag */}
        <div className="pos-tag">
          {ordinalLabel(rank)} · {horse.name.toUpperCase()}
        </div>

        {/* SVG Horse */}
        <HorseSVG
          horseId={horse.id}
          width={58}
          height={35}
          className="horse-silhouette"
        />

        {/* Winner trophy */}
        {isWinner && (
          <div style={{ position: 'absolute', top: '-32px', left: '50%', transform: 'translateX(-50%)', fontSize: '1.2rem' }}>🏆</div>
        )}
      </div>
    </div>
  );
}

// ── Elapsed Timer ─────────────────────────────────────────────────────────────
function useElapsed(raceStartTime, isRacing) {
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!isRacing || !raceStartTime) { setElapsed(0); return; }
    const tick = () => {
      setElapsed(Math.floor((Date.now() - raceStartTime) / 1000));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isRacing, raceStartTime]);

  return elapsed;
}

// ── Main RaceArena ────────────────────────────────────────────────────────────
// Track styles — background per terrain
const TRACK_STYLES = {
  dirt:    {
    background: 'linear-gradient(180deg, rgba(0,0,0,0.3), transparent 20%, transparent 80%, rgba(0,0,0,0.3)), repeating-linear-gradient(90deg, #b89066 0 12px, #a37f57 12px 14px), #a37f57',
  },
  asphalt: {
    backgroundImage: "url('/assets/images/asphalt_lane_400x72.svg')",
    backgroundRepeat: 'repeat-x',
    backgroundSize: '400px auto',
    backgroundColor: '#3c3c41',
  },
  sand:    {
    background: 'linear-gradient(180deg, rgba(0,0,0,0.2), transparent 20%, transparent 80%, rgba(0,0,0,0.2)), repeating-linear-gradient(90deg, #e8d5a3 0 10px, #d4c28e 10px 12px), #d4c28e',
  },
  snow:    {
    background: 'linear-gradient(180deg, rgba(0,0,0,0.15), transparent 20%, transparent 80%, rgba(0,0,0,0.15)), repeating-linear-gradient(90deg, #f0f4ff 0 14px, #dde3f5 14px 16px), #dde3f5',
  },
};

export default function RaceArena({ horses, gameState, horsePositions, raceInfo, lastWinner, activeBet, raceStartTime, activeTrack = 'dirt' }) {
  const isRacing  = gameState === 'race';
  const isBetting = gameState === 'betting';
  const isResults = gameState === 'results';
  const elapsed   = useElapsed(raceStartTime, isRacing);

  const leadHorse = useMemo(() => {
    if (!horsePositions || !horses) return null;
    const entries = Object.entries(horsePositions);
    if (!entries.length) return null;
    const leadId = parseInt(entries.reduce((best, curr) => Number(curr[1]) > Number(best[1]) ? curr : best)[0]);
    return horses.find(h => h.id === leadId);
  }, [horsePositions, horses]);

  const maxProgress = Math.round(Math.max(...Object.values(horsePositions || {}).map(Number), 0));
  const myHorse = activeBet ? horses?.find(h => h.id === activeBet.horseId) : null;

  // My horse rank
  const myRank = useMemo(() => {
    if (!myHorse || !horsePositions) return null;
    const sorted = Object.entries(horsePositions)
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .map(([id]) => parseInt(id));
    return sorted.indexOf(myHorse.id) + 1;
  }, [myHorse, horsePositions]);

  if (!horses || horses.length === 0) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--cream-dim)' }}>
        🏇 Loading race…
      </div>
    );
  }

  return (
    <div className="race-screen-content">
      {/* Race hero */}
      <div className="race-hero">
        <div className="race-row">
          <div>
            <div className="race-title">
              Race <span className="ornament">№</span> {raceInfo?.raceId?.substring(0, 8) || '--------'}
            </div>
            <div className="race-meta">
              Dirt <span className="pip">•</span> {horses.length} horses
              {activeBet && <span> <span className="pip">•</span> {activeBet.amount} coins in</span>}
            </div>
          </div>
          <div className="live-dot" style={{ padding: '5px 10px' }}>
            <span className="dot"></span>
            {isRacing ? 'LIVE' : isResults ? 'RESULTS' : 'WAITING'}
          </div>
        </div>
        <div className="race-stats">
          <div className="race-stat">
            <div className="lbl">Leading</div>
            <div className="val gold">{isRacing || isResults ? (lastWinner?.name || leadHorse?.name || '—') : '—'}</div>
          </div>
          <div className="race-stat">
            <div className="lbl">Elapsed</div>
            <div className="val">{`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`}</div>
          </div>
          <div className="race-stat">
            <div className="lbl">Progress</div>
            <div className="val live">{maxProgress}%</div>
          </div>
        </div>
      </div>

      {/* Your horse banner */}
      {myHorse && (
        <div className="your-horse">
          <div className="your-horse-icon">
            <HorseSVG horseId={myHorse.id} width={28} height={18} />
          </div>
          <div className="your-horse-text">
            <div className="lbl">Your horse</div>
            <div className="val">{myHorse.name} <strong>{myHorse.odds}×</strong></div>
          </div>
          {myRank && (
            <div className="your-horse-pos">
              {myRank}<sup>{myRank === 1 ? 'ST' : myRank === 2 ? 'ND' : myRank === 3 ? 'RD' : 'TH'}</sup>
            </div>
          )}
        </div>
      )}

      {/* Results banner */}
      {isResults && lastWinner && (
        <div style={{
          margin: '0 20px 16px',
          padding: '14px 18px',
          background: 'linear-gradient(90deg, rgba(212,163,92,0.18), rgba(212,163,92,0.06))',
          border: '1px solid var(--line-strong)',
          borderLeft: '3px solid var(--gold)',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: '1.1rem',
          color: 'var(--gold-bright)',
        }}>
          🏆 {lastWinner.name} wins the race!
          {activeBet && (
            <div style={{ fontFamily: 'var(--font-mono)', fontStyle: 'normal', fontSize: '0.7rem', marginTop: '4px', color: activeBet.horseId === lastWinner.id ? 'var(--forest)' : 'var(--crimson)' }}>
              {activeBet.horseId === lastWinner.id ? '🎉 Your horse won!' : '💸 Better luck next time'}
            </div>
          )}
        </div>
      )}

      {/* Arena */}
      <div className="arena" style={TRACK_STYLES[activeTrack] || TRACK_STYLES.dirt}>
        <div className="finish-line"></div>
        {horses.map(horse => (
          <RaceLane
            key={horse.id}
            horse={horse}
            pos={horsePositions?.[horse.id] ?? 0}
            allPositions={horsePositions ?? {}}
            isRacing={isRacing}
            isResults={isResults}
            lastWinner={lastWinner}
            activeBet={activeBet}
          />
        ))}
      </div>

      {/* Progress bar */}
      <div className="race-progress">
        <div className="rp-row">
          <div className="rp-label">Distance to finish line</div>
          <div className="rp-value">{maxProgress}m / 100m</div>
        </div>
        <div className="rp-bar">
          <div className="rp-fill" style={{ width: `${maxProgress}%`, transition: 'width 0.3s ease' }}></div>
        </div>
      </div>
    </div>
  );
}