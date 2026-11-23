import { Icon } from "../icons";

/** Fragmen antarmuka nyata produk (bukan screenshot): satu input/kode + satu hasil terlihat per ubin. Data contoh ditandai. */

export function TicketFragment() {
  const rows = [
    { name: "Pendaftaran", state: "Selesai", cls: "done" },
    { name: "Poli Penyakit Dalam", state: "Sedang dilayani", cls: "now" },
    { name: "Farmasi", state: "Menunggu", cls: "next" },
  ];
  return (
    <div className="frag frag--ticket">
      <div className="frag__top">
        <span className="t-date muted">Tiket</span>
        <strong className="frag__no">A-014</strong>
      </div>
      <ul className="frag__stages">
        {rows.map((r) => (
          <li key={r.name} className={`frag__stage frag__stage--${r.cls}`}>
            <span className="frag__mark">{r.cls === "done" ? <Icon name="check" /> : null}</span>
            <span>{r.name}</span>
            <em>{r.state}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CodeFragment() {
  return (
    <pre className="code" aria-label="Contoh respons API antrean">
      <span className="c-dim">GET /api/v1/visits/&#123;id&#125;/queue</span>
      {"\n"}
      {"{ "}
      <span className="c-key">&quot;stage_name&quot;</span>: <span className="c-str">&quot;Pemeriksaan poli&quot;</span>,{"\n  "}
      <span className="c-key">&quot;queue_position&quot;</span>: <span className="c-num">3</span>,{"\n  "}
      <span className="c-key">&quot;estimated_wait_minutes&quot;</span>: <span className="c-num">24</span>,{"\n  "}
      <span className="c-key">&quot;near_turn&quot;</span>: <span className="c-num">true</span> {"}"}
    </pre>
  );
}

export function LedgerFragment() {
  const rows = [
    { n: "A-012", name: "Siti R.", s: "Dipanggil", c: "dipanggil" },
    { n: "A-013", name: "Budi H.", s: "Menunggu", c: "menunggu" },
    { n: "A-014", name: "Dewi L.", s: "Menunggu", c: "menunggu" },
  ];
  return (
    <div className="frag frag--ledger">
      <div className="frag__top">
        <span className="t-label">Antrean poli</span>
        <span className="btn btn--primary btn--sm" aria-hidden="true">
          Panggil berikutnya
        </span>
      </div>
      <table className="frag__table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.n}>
              <td className="mono">{r.n}</td>
              <td>{r.name}</td>
              <td>
                <span className={`chip chip--${r.c}`}>
                  <span className="chip__dot" />
                  {r.s}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PickupFragment() {
  return (
    <div className="frag frag--pickup">
      <span className="icon-chip icon-chip--32 icon-chip--mint">
        <Icon name="pill" />
      </span>
      <div>
        <p className="t-label">Obat siap diambil</p>
        <p className="t-small muted">Tunjukkan nomor tiket A-014 di loket farmasi.</p>
      </div>
    </div>
  );
}

export function AuditFragment() {
  return (
    <div className="frag frag--audit">
      <ul className="frag__log">
        <li>
          <span className="mono">poli</span>
          <span>start</span>
          <span className="mono">dipanggil → sedang_dilayani</span>
        </li>
        <li>
          <span className="mono">poli</span>
          <span>complete</span>
          <span className="mono">sedang_dilayani → selesai</span>
        </li>
      </ul>
      <pre className="code code--sm" aria-label="Contoh galat saat audit diubah">
        <span className="c-dim">DELETE FROM audit_logs;</span>
        {"\n"}
        <span className="c-err">ERROR:  audit_logs bersifat append-only</span>
      </pre>
    </div>
  );
}

export function TokenFragment() {
  return (
    <div className="frag frag--token">
      <div className="field">
        <span className="label">Tautan tiket</span>
        <div className="frag__url mono">
          /tiket/<span className="muted">3f9c…e21</span>#<span className="frag__secret">••••••••••••</span>
        </div>
        <span className="hint">Token ada di fragmen URL, tidak ikut ke log server. Yang disimpan hanya hash-nya.</span>
      </div>
    </div>
  );
}
