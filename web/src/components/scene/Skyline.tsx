import { useMemo } from 'react';

/** Small seeded PRNG so the city looks the same on every load. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

interface Tower { x: number; w: number; h: number; roof: 'flat' | 'spire' | 'step' | 'tank' }
interface Win { x: number; y: number; w: number; h: number; c: string; blink?: number }

const W = 1000;
const H = 420;
const WARM = ['#ffd27a', '#ffc35c', '#ffe3a3', '#ffb347'];
const COOL = ['#a8d8ff', '#cfe8ff'];

function towers(r: () => number, minH: number, maxH: number, minW: number, maxW: number, gap: number): Tower[] {
  const out: Tower[] = [];
  let x = -20;
  const roofs: Tower['roof'][] = ['flat', 'flat', 'spire', 'step', 'tank'];
  while (x < W + 20) {
    const w = Math.round(minW + r() * (maxW - minW));
    const h = Math.round(minH + r() * (maxH - minH));
    out.push({ x, w, h, roof: roofs[Math.floor(r() * roofs.length)] });
    x += w + Math.round(r() * gap);
  }
  return out;
}

function windows(r: () => number, t: Tower[], lit: number, size: [number, number], step: [number, number], blinkShare: number): Win[] {
  const out: Win[] = [];
  for (const b of t) {
    const cols = Math.max(1, Math.floor((b.w - 10) / step[0]));
    const x0 = b.x + (b.w - cols * step[0]) / 2 + (step[0] - size[0]) / 2;
    for (let y = H - b.h + 14; y < H - 8; y += step[1]) {
      const rowLit = r() < 0.85; // some floors are dark
      for (let c = 0; c < cols; c++) {
        if (!rowLit || r() > lit) continue;
        const cool = r() < 0.12;
        const pal = cool ? COOL : WARM;
        out.push({
          x: Math.round(x0 + c * step[0]), y: Math.round(y), w: size[0], h: size[1],
          c: pal[Math.floor(r() * pal.length)],
          blink: r() < blinkShare ? Math.round(r() * 12) : undefined,
        });
      }
    }
  }
  return out;
}

function Roof({ b, fill }: { b: Tower; fill: string }) {
  const top = H - b.h;
  const cx = b.x + b.w / 2;
  if (b.roof === 'spire') {
    return (
      <>
        <rect x={cx - 3} y={top - 34} width={6} height={34} fill={fill} />
        <rect x={cx - 1} y={top - 58} width={2} height={26} fill={fill} />
        <circle cx={cx} cy={top - 60} r={2.4} className="sky-beacon" fill="#ff4a4a" />
      </>
    );
  }
  if (b.roof === 'step') return <rect x={b.x + b.w * 0.2} y={top - 18} width={b.w * 0.6} height={18} fill={fill} />;
  if (b.roof === 'tank') {
    return (
      <>
        <rect x={b.x + b.w * 0.6} y={top - 16} width={14} height={12} rx={2} fill={fill} />
        <rect x={b.x + b.w * 0.6 + 2} y={top - 4} width={2} height={4} fill={fill} />
        <rect x={b.x + b.w * 0.6 + 10} y={top - 4} width={2} height={4} fill={fill} />
      </>
    );
  }
  return null;
}

/** Night city behind the vaults: a hazy far layer and big near skyscrapers with lit windows. */
export function Skyline() {
  const city = useMemo(() => {
    const r = rng(20261114);
    const far = towers(r, 110, 230, 34, 70, 6);
    const near = towers(r, 170, 360, 62, 120, 22);
    return {
      far,
      near,
      farWin: windows(r, far, 0.22, [3, 4], [8, 11], 0),
      nearWin: windows(r, near, 0.34, [5, 7], [12, 16], 0.05),
    };
  }, []);

  return (
    <svg className="skyline-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2350" stopOpacity="0" />
          <stop offset="1" stopColor="#3a2a5a" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="near-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f1324" />
          <stop offset="1" stopColor="#090b15" />
        </linearGradient>
      </defs>
      <rect x="0" y={H - 200} width={W} height="200" fill="url(#sky-haze)" />

      <g fill="#1c2238">
        {city.far.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={H - b.h} width={b.w} height={b.h} />
            <Roof b={b} fill="#1c2238" />
          </g>
        ))}
      </g>
      <g opacity="0.45">
        {city.farWin.map((w, i) => <rect key={i} x={w.x} y={w.y} width={w.w} height={w.h} fill={w.c} />)}
      </g>

      <g fill="url(#near-fade)">
        {city.near.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={H - b.h} width={b.w} height={b.h} />
            <Roof b={b} fill="#0f1324" />
          </g>
        ))}
      </g>
      <g opacity="0.85">
        {city.nearWin.map((w, i) => (
          <rect
            key={i} x={w.x} y={w.y} width={w.w} height={w.h} fill={w.c}
            className={w.blink !== undefined ? 'sky-twinkle' : undefined}
            style={w.blink !== undefined ? { animationDelay: `${-w.blink}s` } : undefined}
          />
        ))}
      </g>
    </svg>
  );
}
