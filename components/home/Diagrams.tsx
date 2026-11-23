import { Icon } from "../icons";

/** Skema teknis: node HTML bersudut 8–12px di atas jalur SVG 1px (non-scaling). Satu arah baca, sedikit node. */

function Arrowheads({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M1 1 7 4 1 7" fill="none" stroke="#8995a1" strokeWidth="1" />
      </marker>
    </defs>
  );
}

function Wires({ id, paths }: { id: string; paths: string[] }) {
  return (
    <svg className="diagram__wires" viewBox="0 0 520 260" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <Arrowheads id={id} />
      {paths.map((d) => (
        <path key={d} d={d} fill="none" stroke="#657482" strokeWidth="1" vectorEffect="non-scaling-stroke" markerEnd={`url(#${id})`} />
      ))}
    </svg>
  );
}

type NodeProps = { x: number; y: number; w: number; title: string; sub?: string; chip?: "lime" | "mint" | "cyan"; icon?: Parameters<typeof Icon>[0]["name"] };
function Node({ x, y, w, title, sub, chip = "lime", icon = "layers" }: NodeProps) {
  return (
    <div className="dnode" style={{ left: `${(x / 520) * 100}%`, top: `${(y / 260) * 100}%`, width: `${(w / 520) * 100}%` }}>
      <span className={`dchip dchip--${chip}`}>
        <Icon name={icon} />
      </span>
      <div>
        <div className="dnode__t">{title}</div>
        {sub ? <div className="dnode__s mono">{sub}</div> : null}
      </div>
    </div>
  );
}

/** 1) Satu tiket, tiga tahap */
export function FlowDiagram() {
  return (
    <div className="diagram" role="img" aria-label="Alur satu tiket: pendaftaran, lalu poli, lalu farmasi">
      <Wires id="a1" paths={["M 158 112 L 192 112", "M 330 112 L 364 112"]} />
      <Node x={12} y={112} w={146} title="Pendaftaran" sub="tahap 1" chip="lime" icon="clipboard" />
      <Node x={192} y={112} w={138} title="Poli" sub="tahap 2" chip="mint" icon="stethoscope" />
      <Node x={364} y={112} w={144} title="Farmasi" sub="tahap 3" chip="cyan" icon="pill" />
      <p className="diagram__cap mono">tahap berikutnya dibuat saat tahap sebelumnya selesai</p>
    </div>
  );
}

/** 2) Dua petugas, satu pemenang */
export function LockDiagram() {
  return (
    <div className="diagram" role="img" aria-label="Dua petugas menekan panggil berikutnya bersamaan; basis data memberi tiket berbeda">
      <Wires id="a2" paths={["M 140 64 L 196 106", "M 140 196 L 196 154", "M 336 130 L 372 130"]} />
      <Node x={12} y={64} w={128} title="Petugas A" sub="panggil" chip="lime" icon="user" />
      <Node x={12} y={196} w={128} title="Petugas B" sub="panggil" chip="lime" icon="user" />
      <Node x={196} y={130} w={140} title="FOR UPDATE" sub="SKIP LOCKED" chip="mint" icon="lock" />
      <Node x={372} y={130} w={136} title="A-012, A-013" sub="tiket berbeda" chip="cyan" icon="list" />
    </div>
  );
}

/** 3) Pasien hanya melihat yang perlu */
export function PrivacyDiagram() {
  return (
    <div className="diagram" role="img" aria-label="Token di browser, hash di basis data, identitas nasional tidak pernah dikirim balik">
      <Wires id="a3" paths={["M 150 66 L 196 66", "M 326 66 L 372 66", "M 80 96 L 80 170", "M 150 200 L 196 200"]} />
      <Node x={12} y={66} w={138} title="Peramban" sub="token acak" chip="lime" icon="user" />
      <Node x={196} y={66} w={130} title="sha256" sub="hash saja" chip="mint" icon="shield" />
      <Node x={372} y={66} w={136} title="Visit" sub="akses terbatas" chip="cyan" icon="layers" />
      <Node x={12} y={200} w={138} title="Respons" sub="MRN samar" chip="lime" icon="clipboard" />
      <Node x={196} y={200} w={312} title="NIK dan KK" sub="tidak pernah dikirim balik" chip="mint" icon="lock" />
    </div>
  );
}
