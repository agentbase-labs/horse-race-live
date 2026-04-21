import React from 'react';

// ── Horse base path (designer-provided, facing right →) ──────────────────────
// All 6 horses share the same silhouette path; color/pattern differ per horse.
const HORSE_BASE_PATH = "M360 85 C390 85, 390 125, 360 125 C330 125, 320 115, 310 110 L300 130 C310 150, 315 170, 315 190 L300 190 C300 170, 295 155, 285 140 L210 140 L210 190 L195 190 L195 140 L160 140 C140 140, 130 130, 130 110 L130 80 Q130 60, 150 60 L230 60 L240 90 L310 90 C330 90, 340 85, 360 85 Z M160 140 L160 190 L145 190 L145 140 M130 110 L90 110 C70 110, 60 120, 60 140 C60 160, 70 170, 90 170 L90 110";

// ── Horse spot patterns (for spotted horses) ──────────────────────────────────
// Horse 3: black spots on white
const HORSE3_SPOTS = [
  "M180 90 Q210 80, 230 100 T250 130 Q220 140, 190 130 T170 100 Z",
  "M310 130 Q330 120, 340 140 T330 160 Z",
];
// Horse 6: brown spots on white
const HORSE6_SPOTS = [
  "M200 80 Q230 70, 250 90 T270 120 Q240 130, 210 120 T190 90 Z",
  "M140 110 L170 110 L170 140 L140 140 Z",
];

// ── Horse configs ─────────────────────────────────────────────────────────────
export const HORSE_CONFIGS = {
  1: { name: 'Oded',  coat: '#FFFFFF', stroke: '#000000', spots: null,         spotColor: null,     laneColor: '#c73e3e' }, // white
  2: { name: 'Shon',  coat: '#111111', stroke: '#333333', spots: null,         spotColor: null,     laneColor: '#4a6fa8' }, // black
  3: { name: 'Joy',   coat: '#FFFFFF', stroke: '#000000', spots: HORSE3_SPOTS, spotColor: '#111111',laneColor: '#b88840' }, // white + black spots
  4: { name: 'Naya',  coat: '#5D4037', stroke: '#3e2723', spots: null,         spotColor: null,     laneColor: '#6a6a6a' }, // dark brown
  5: { name: 'Lai',   coat: '#D7CCC8', stroke: '#8d6e63', spots: null,         spotColor: null,     laneColor: '#5a9168' }, // light brown
  6: { name: 'Hadar', coat: '#FFFFFF', stroke: '#5D4037', spots: HORSE6_SPOTS, spotColor: '#8D6E63',laneColor: '#9b59b6' }, // white + brown spots
};

// ── HorseSVG component ────────────────────────────────────────────────────────
export function HorseSVG({ horseId, width = 58, height = 35, className = '', style = {} }) {
  const cfg = HORSE_CONFIGS[horseId] || HORSE_CONFIGS[1];

  return (
    <svg
      viewBox="0 0 400 240"
      width={width}
      height={height}
      className={className}
      style={style}
    >
      {/* Base silhouette */}
      <path
        d={HORSE_BASE_PATH}
        fill={cfg.coat}
        stroke={cfg.stroke}
        strokeWidth="2"
        fillRule="evenodd"
      />
      {/* Spots / markings (optional) */}
      {cfg.spots && cfg.spots.map((d, i) => (
        <path key={i} d={d} fill={cfg.spotColor} />
      ))}
    </svg>
  );
}

// ── Legacy default export (keeps App.jsx from breaking) ───────────────────────
export default function HorseSVGSymbols() {
  return null;
}