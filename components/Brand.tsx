import { useId } from "react";

/**
 * Pita lipat menanjak. Geometri orisinal, dihitung dari parameter (bukan koordinat tempelan):
 *  - tiga irisan depan (parallelogram, sisi panjang condong 20° dari vertikal, tepi atas horizontal),
 *    bertangga (+STEP_X, -STEP_Y) ke kanan-atas; irisan terakhir meluas melewati tepi stage;
 *  - di tiap celah ada bidang penghubung (return plane) yang meruncing ke sudut kiri-atas irisan berikutnya;
 *  - gradien horizontal per bidang (lime→leaf, mint→teal, sky→electric-sky; penghubung green→jade, aqua→cyan);
 *  - tanpa garis tepi, tekstur, atau bayangan. Induknya (overflow hidden) memotong kiri/kanan/bawah.
 * Satuan = piksel desktop; seluruh grup diskalakan sebagai satu kesatuan lewat ukuran <svg>.
 */
export const ART_W = 2600;
export const ART_H = 760;

const K = Math.tan((20 * Math.PI) / 180); // condong sisi panjang
const BOTTOM = 2000; // jauh di bawah stage; selalu terpotong
const STEP_X = 440;
const STEP_Y = 241;
const SLAB_W = 300; // lebar tepi atas; celah horizontal = STEP_X - K*STEP_Y - SLAB_W ≈ 52
const TOP0 = 560; // y tepi atas irisan pertama

type P = [number, number];
const fmt = (pts: P[]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

function slab(x: number, y: number, w: number): P[] {
  const dx = K * (BOTTOM - y);
  return [
    [x, y],
    [x + w, y],
    [x + w - dx, BOTTOM],
    [x - dx, BOTTOM],
  ];
}
function connector(x: number, y: number, w: number, nx: number, ny: number): P[] {
  return [
    [x + w, y],
    [nx, ny],
    [nx - K * (BOTTOM - ny), BOTTOM],
    [x + w - K * (BOTTOM - y), BOTTOM],
  ];
}

const FACES = [0, 1, 2].map((i) => ({ x: i * STEP_X, y: TOP0 - i * STEP_Y }));

export const SPECTRUM_PLANES = [
  { id: "c1", kind: "connector", from: "#65f75f", to: "#12f0aa", pts: connector(FACES[0].x, FACES[0].y, SLAB_W, FACES[1].x, FACES[1].y) },
  { id: "c2", kind: "connector", from: "#01d3d8", to: "#02b7f1", pts: connector(FACES[1].x, FACES[1].y, SLAB_W, FACES[2].x, FACES[2].y) },
  { id: "f1", kind: "front", from: "#deff34", to: "#8cf97c", pts: slab(FACES[0].x, FACES[0].y, SLAB_W) },
  { id: "f2", kind: "front", from: "#45f4bc", to: "#33dfdf", pts: slab(FACES[1].x, FACES[1].y, SLAB_W) },
  // irisan terakhir meluas jauh ke kanan: melewati tepi viewport mana pun
  { id: "f3", kind: "front", from: "#34c8f4", to: "#34bcff", pts: slab(FACES[2].x, FACES[2].y, 2400 - FACES[2].x) },
] as const;

export function FoldedSpectrum({ className, testId }: { className?: string; testId?: string }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      className={className}
      width={ART_W}
      height={ART_H}
      viewBox={`0 0 ${ART_W} ${ART_H}`}
      preserveAspectRatio="xMinYMax slice"
      aria-hidden="true"
      focusable="false"
      data-testid={testId}
    >
      <defs>
        {SPECTRUM_PLANES.map((p) => (
          <linearGradient key={p.id} id={`${uid}-${p.id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={p.from} />
            <stop offset="1" stopColor={p.to} />
          </linearGradient>
        ))}
      </defs>
      <g className="spectrum-group">
        {SPECTRUM_PLANES.map((p) => (
          <polygon key={p.id} data-plane={p.id} points={fmt(p.pts as unknown as P[])} fill={`url(#${uid}-${p.id})`} />
        ))}
      </g>
    </svg>
  );
}

/** Glif merek kecil: tiga irisan berundak (lime, mint, cyan). */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <polygon points="0,17 7,17 4.5,22 0,22" fill="#deff34" />
      <polygon points="7.5,11 14.5,11 11,22 5.5,22" fill="#31f2bf" />
      <polygon points="15,5 22,5 22,22 12.5,22" fill="#02b7f1" />
    </svg>
  );
}

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className="wordmark" style={light ? { color: "#fff" } : undefined}>
      <Mark />
      Giliranku
    </span>
  );
}
