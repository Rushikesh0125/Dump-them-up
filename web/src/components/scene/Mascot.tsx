import { useMemo } from 'react';
import { CARTELS, type CartelId } from '../../game/config';

/** Pixel mascot drawn from the cartel's character map (12×16 grid, one path per colour). */
export function MascotPaths({ id }: { id: CartelId }) {
  const paths = useMemo(() => {
    const def = CARTELS[id];
    return Object.entries(def.palette).map(([ch, fill]) => {
      let d = '';
      def.mascot.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) if (row[x] === ch) d += `M${x} ${y}h1v1h-1z`;
      });
      return { ch, fill, d };
    }).filter((p) => p.d);
  }, [id]);
  return <>{paths.map((p) => <path key={p.ch} d={p.d} fill={p.fill} />)}</>;
}

export function Mascot({ id, width, label }: { id: CartelId; width: number; label?: string }) {
  return (
    <svg
      width={width}
      height={(width * 16) / 12}
      viewBox="0 0 12 16"
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <MascotPaths id={id} />
    </svg>
  );
}
