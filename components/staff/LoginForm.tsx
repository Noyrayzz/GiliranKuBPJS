"use client";

import { useRef, useState } from "react";
import { Icon } from "../icons";
import { api, ApiError } from "@/lib/client";

interface Demo { password: string; accounts: { username: string; label: string; unit: string | null }[] }

export function LoginForm({ demo }: { demo: Demo | null }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ u?: string; p?: string }>({});
  const [busy, setBusy] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const fe: { u?: string; p?: string } = {};
    if (!username.trim()) fe.u = "Nama pengguna wajib diisi.";
    if (!password) fe.p = "Kata sandi wajib diisi.";
    setFieldErr(fe);
    setError(null);
    if (fe.u) return userRef.current?.focus();
    if (fe.p) return passRef.current?.focus();
    setBusy(true);
    try {
      const { data } = await api<{ staff_user: { role: string } }>("/staff-auth/login", { body: { username, password } });
      window.location.assign(data.staff_user.role === "admin" ? "/admin" : "/petugas");
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? err.message : "Terjadi gangguan. Coba lagi.");
    }
  }

  return (
    <div className="split split--login">
      <div>
        <header className="page__head" style={{ marginBottom: 32 }}>
          <p className="t-eyebrow">Khusus staf rumah sakit</p>
          <h1 className="t-heading">
            Masuk petugas. <span className="cont">Anda hanya melihat antrean unit yang ditugaskan.</span>
          </h1>
        </header>
        {error ? (
          <div className="alert alert--error" role="alert" style={{ marginBottom: 20 }}>
            <Icon name="alert" />
            <div>{error}</div>
          </div>
        ) : null}
        <form onSubmit={submit} noValidate className="stack-24" aria-label="Masuk petugas">
          <div className="field">
            <label htmlFor="u">Nama pengguna</label>
            <input
              id="u" ref={userRef} className="input" autoComplete="username" autoCapitalize="none" spellCheck={false}
              value={username} onChange={(e) => setUsername(e.target.value)}
              aria-invalid={fieldErr.u ? true : undefined} aria-describedby={fieldErr.u ? "u-err" : undefined}
            />
            {fieldErr.u ? <span id="u-err" className="error-text" role="alert">{fieldErr.u}</span> : null}
          </div>
          <div className="field">
            <label htmlFor="p">Kata sandi</label>
            <input
              id="p" ref={passRef} className="input" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              aria-invalid={fieldErr.p ? true : undefined} aria-describedby={fieldErr.p ? "p-err" : undefined}
            />
            {fieldErr.p ? <span id="p-err" className="error-text" role="alert">{fieldErr.p}</span> : null}
          </div>
          <button ref={submitRef} className="btn btn--primary btn--block" type="submit" disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {busy ? "Memeriksa…" : "Masuk"}
          </button>
          <p className="hint">Sesi berakhir otomatis setelah 30 menit tanpa aktivitas.</p>
        </form>
      </div>

      {demo ? (
        <aside className="demo-box" aria-label="Akun demo">
          <h2 className="t-label">Akun demo</h2>
          <p className="t-small muted" style={{ marginTop: 4 }}>
            Lingkungan ini memakai data tiruan. Pilih akun untuk mengisi formulir; kata sandi semua akun: <span className="mono">{demo.password}</span>.
          </p>
          <div className="demo-accounts">
            {demo.accounts.map((a) => (
              <button
                key={a.username}
                type="button"
                onClick={() => {
                  setUsername(a.username);
                  setPassword(demo.password);
                  setError(null);
                  setFieldErr({});
                  submitRef.current?.focus();
                }}
              >
                <b>{a.label}</b>
                <span>{a.username}{a.unit ? ` · ${a.unit}` : ""}</span>
              </button>
            ))}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
