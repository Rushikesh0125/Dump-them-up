import { motion } from 'framer-motion';

// Reveal effects. Blast: "Explosions - Pixel Art" by aim-studios (CC0), an 11-frame 64×64 sheet.
// Smoke: Kenney "Particle Pack" (CC0). See web/public/CREDITS.md.

const FRAMES = 11;
const SCALE = 3;
const SIZE = 64 * SCALE;

function Blast({ x, y, delay, scale = 1 }: { x: string; y: string; delay: number; scale?: number }) {
  return (
    <span
      className="fx-blast"
      style={{
        left: x, top: y, width: SIZE * scale, height: SIZE * scale,
        backgroundSize: `${FRAMES * SIZE * scale}px ${SIZE * scale}px`,
        animationDelay: `${delay}s`,
        ['--fx-end' as string]: `-${FRAMES * SIZE * scale}px`,
      }}
    />
  );
}

/** Pixel explosion for a DUMP, grey smoke for a bust. Purely visual, plays once. */
export function BurstFx({ win }: { win: boolean }) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
  return (
    <div className="fx-layer" aria-hidden="true">
      {win ? (
        <>
          <Blast x="50%" y="46%" delay={0} />
          <Blast x="28%" y="62%" delay={0.12} scale={0.55} />
          <Blast x="72%" y="34%" delay={0.22} scale={0.6} />
        </>
      ) : (
        [0, 1, 2].map((k) => (
          <motion.img
            key={k}
            src="/fx/smoke.png"
            alt=""
            className="fx-smoke"
            style={{ left: `${38 + k * 12}%` }}
            initial={{ scale: 0.3, opacity: 0, y: 20 }}
            animate={{ scale: [0.3, 1.5, 1.9], opacity: [0, 1, 0], y: [20, -10, -50] }}
            transition={{ duration: 1.5, delay: k * 0.12, ease: 'easeOut' }}
          />
        ))
      )}
    </div>
  );
}
