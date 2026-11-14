import { useEffect, useState } from 'react';
import { CARTELS, PROTECTION, type CartelId, type Motif, type ProtectionTier } from '../../game/config';
import { MascotPaths } from './Mascot';

const circle = (cx: number, cy: number, r: number) =>
  `M${(cx - r).toFixed(1)} ${cy.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

function motifPath(kind: Motif, x: number, y: number) {
  if (kind === 'flame') return `M${x.toFixed(1)} ${(y - 7).toFixed(1)}c3 3 5 6 5 8a5 5 0 0 1 -10 0c0 -2 2 -5 5 -8z`;
  if (kind === 'bone') return `M${(x - 5).toFixed(1)} ${(y - 1.2).toFixed(1)}h10v2.4h-10z` + circle(x - 6, y - 1.8, 2) + circle(x - 6, y + 1.8, 2) + circle(x + 6, y - 1.8, 2) + circle(x + 6, y + 1.8, 2);
  return circle(x, y + 2, 3.2) + circle(x - 3.6, y - 2.4, 1.6) + circle(x, y - 4, 1.6) + circle(x + 3.6, y - 2.4, 1.6);
}

const BOLTS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  return circle(100 + 63 * Math.cos(a), 110 + 63 * Math.sin(a), 3.5);
}).join('');

const RING = 2 * Math.PI * 82;

interface Props {
  id: CartelId;
  stashPct: number; // 0..1
  protection: ProtectionTier;
  spinning: boolean;
}

/** A cartel's vault door with its stash ring and (optional) protection cover. */
export function Vault({ id, stashPct, protection, spinning }: Props) {
  const c = CARTELS[id];
  const prot = PROTECTION[protection];
  const motif = Array.from({ length: 8 }, (_, i) => {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    return motifPath(c.motif, 100 + 42 * Math.cos(a), 110 + 42 * Math.sin(a));
  }).join('');

  // slow tick for the cover glint and sparkles
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!protection) return;
    const t = setInterval(() => setTick((n) => n + 1), 120);
    return () => clearInterval(t);
  }, [protection]);
  const glintX = 34 + (((tick * 0.02 + protection * 0.3) % 1) * 106);
  const sparkles = [[22, 62], [178, 70], [182, 160], [18, 150], [150, 196]]
    .filter((_, i) => (i + Math.floor(tick / 4)) % 2 === 0)
    .map(([x, y]) => `M${x} ${y - 5}l1.5 3.5l3.5 1.5l-3.5 1.5l-1.5 3.5l-1.5 -3.5l-3.5 -1.5l3.5 -1.5z`).join('');

  return (
    <svg viewBox="0 0 200 244" className="vault-svg" role="img" aria-label={`${c.ticker} cartel vault`}>
      <rect x="10" y="22" width="180" height="176" rx="18" fill={c.frame} stroke={c.trim} strokeWidth="4" />
      <circle cx="100" cy="110" r="82" fill="none" stroke="#2e2620" strokeWidth="8" />
      <circle
        cx="100" cy="110" r="82" fill="none" stroke={c.neon} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${(Math.max(0, Math.min(1, stashPct)) * RING).toFixed(1)} ${RING.toFixed(1)}`}
        transform="rotate(-90 100 110)" className="stash-ring"
      />
      <circle cx="100" cy="110" r="70" fill={c.door} stroke={c.doorEdge} strokeWidth="6" />
      <circle cx="100" cy="110" r="56" fill="none" stroke={c.doorEdge} strokeOpacity="0.35" strokeWidth="2" />
      <path d={BOLTS} fill={c.bolt} />
      <path d={motif} fill={c.motifFill} fillOpacity="0.85" />
      <g className={spinning ? 'handle-spin' : undefined} style={{ transformOrigin: '100px 110px' }}>
        <path d="M100 66V154M62 88L138 132M62 132L138 88" stroke={c.bolt} strokeWidth="6" strokeLinecap="round" />
        {[[100, 66], [100, 154], [62, 88], [138, 132], [62, 132], [138, 88]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill={c.bolt} />
        ))}
      </g>
      <circle cx="100" cy="110" r="26" fill="#120f0c" stroke={c.neon} strokeWidth="3" />
      <svg x="84" y="89" width="32" height="42" viewBox="0 0 12 16" shapeRendering="crispEdges">
        <MascotPaths id={id} />
      </svg>

      {protection > 0 && (
        <g className="cover">
          <rect x="3" y="15" width="194" height="190" rx="26" fill={prot.color} fillOpacity="0.09" stroke={prot.color} strokeWidth="3" className="cover-flare" />
          <path d="M16 70V44Q16 26 34 24" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="3" strokeLinecap="round" />
          <path d={`M${glintX.toFixed(1)} 15h26`} fill="none" stroke={prot.color} strokeWidth="5" strokeLinecap="round" className="cover-flare" />
          {protection >= 2 && (
            <rect x="8" y="20" width="184" height="180" rx="21" fill="none" stroke={prot.color} strokeWidth="1.5" strokeDasharray="6 6" strokeOpacity="0.7" />
          )}
          {protection >= 3 && (
            <>
              <path d="M3 41L29 15M171 15L197 41M3 179L29 205M171 205L197 179" stroke={prot.color} strokeWidth="2" strokeOpacity="0.8" />
              {sparkles && <path d={sparkles} fill="#ffffff" />}
            </>
          )}
          <rect x="48" y="28" width="104" height="18" rx="4" fill="#0f0d0b" stroke={prot.color} strokeWidth="2" />
          <text
            x="100" y="41" textAnchor="middle" fontFamily="Courier Prime, monospace" fontSize="10" fontWeight="700" fill={prot.color}
            {...(prot.name.length > 16 ? { textLength: 96, lengthAdjust: 'spacingAndGlyphs' } : {})}
          >
            {prot.name}
          </text>
        </g>
      )}

      <rect x="38" y="204" width="124" height="24" rx="5" fill="#120f0c" stroke={c.neon} strokeWidth="2.5" />
      {/* long tickers ($BLACKDRAGON) are squeezed to the plate instead of spilling over it */}
      <text
        x="100" y="221" textAnchor="middle" fontFamily="Abril Fatface, serif" fontSize="15" fill={c.neon}
        {...(c.ticker.length > 8 ? { textLength: 110, lengthAdjust: 'spacingAndGlyphs' } : {})}
      >
        {c.ticker}
      </text>
    </svg>
  );
}
