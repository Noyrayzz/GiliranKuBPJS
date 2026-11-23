import { spawn, type ChildProcess } from "node:child_process";
import pg from "pg";

// Harness acceptance: instance SEKALI PAKAI. Port, database, dan data sendiri; tidak menyentuh demo di :8090.
export const PORT = 8091;
export const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_URL = "postgres://giliranku:giliranku@127.0.0.1:55432/postgres";

export interface Result { id: string; ok: boolean; detail: string }
export const results: Result[] = [];

export function check(id: string, ok: boolean, detail = ""): boolean {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? "  | " + detail : ""}`);
  return ok;
}
export function eq(id: string, actual: unknown, expected: unknown): boolean {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  return check(id, same, same ? `= ${JSON.stringify(actual)}` : `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}
export const section = (t: string) => console.log(`\n== ${t}`);

export interface Res { status: number; headers: Headers; text: string; json: any }

/** Klien HTTP dengan cookie jar sederhana (hanya gk_session). IP palsu per klien lewat X-Forwarded-For agar rate limit tidak saling mengganggu. */
export class Client {
  cookie = "";
  base = BASE;
  constructor(public name: string, public ip: string) {}
  async req(method: string, path: string, o: { body?: unknown; token?: string; headers?: Record<string, string>; raw?: string } = {}): Promise<Res> {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip, ...(o.headers ?? {}) };
    if (o.body !== undefined || o.raw !== undefined) headers["content-type"] = "application/json";
    if (this.cookie) headers["cookie"] = this.cookie;
    if (o.token) headers["authorization"] = `Bearer ${o.token}`;
    const res = await fetch(this.base + path, {
      method,
      headers,
      body: o.raw !== undefined ? o.raw : o.body === undefined ? undefined : JSON.stringify(o.body),
      redirect: "manual",
    });
    const sc = res.headers.get("set-cookie");
    if (sc && sc.startsWith("gk_session=")) {
      const kv = sc.split(";")[0];
      this.cookie = kv === "gk_session=" ? "" : kv;
      if (this.cookie) cookieSecrets.add(this.cookie.slice("gk_session=".length));
    }
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* bukan JSON */ }
    if (json?.error?.message) errorMessages.add(json.error.message);
    return { status: res.status, headers: res.headers, text, json };
  }
  get = (p: string, o?: Parameters<Client["req"]>[2]) => this.req("GET", p, o);
  post = (p: string, body: unknown = {}, o: Parameters<Client["req"]>[2] = {}) => this.req("POST", p, { ...o, body });
  patch = (p: string, body: unknown, o: Parameters<Client["req"]>[2] = {}) => this.req("PATCH", p, { ...o, body });
  del = (p: string) => this.req("DELETE", p);
}
export const cookieSecrets = new Set<string>();
export const errorMessages = new Set<string>();

export class Server {
  proc!: ChildProcess;
  log = "";
  constructor(public port: number = PORT) {}
  get base() {
    return `http://127.0.0.1:${this.port}`;
  }
  start(env: Record<string, string>) {
    this.proc = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(this.port)], {
      cwd: process.cwd(),
      env: { ...process.env, ...env, PATH: `/home/kelvin/.local/opt/node22/bin:${process.env.PATH}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.proc.stdout?.on("data", (d) => (this.log += d));
    this.proc.stderr?.on("data", (d) => (this.log += d));
  }
  async healthy(timeoutMs = 30_000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try { if ((await fetch(`${this.base}/api/health`)).status === 200) return true; } catch { /* belum naik */ }
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  }
  stop() { this.proc?.kill("SIGTERM"); }
}

export async function createTempDb() {
  const name = `giliranku_acc_${Date.now()}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  return { name, url: `postgres://giliranku:giliranku@127.0.0.1:55432/${name}` };
}
export async function dropTempDb(name: string) {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.end();
}
/** Memutus dependensi dengan sengaja: ganti nama database lalu putus koneksi (tidak menyentuh DB demo). */
export async function renameDb(from: string, to: string) {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [from]);
  await admin.query(`alter database ${from} rename to ${to}`);
  await admin.end();
}

export interface State {
  db: string;
  dbUrl: string;
  pool: pg.Pool;
  server: Server;
  pub: Client;
  admin: Client;
  daftar: Client;
  poli: Client;
  farmasi: Client;
  today: string;
  tomorrow: string;
  hospitalId: string;
  clinicId: string;
  units: { registration: string; clinic: string; pharmacy: string };
  stages: { registration: string; clinic: string; pharmacy: string };
  secrets: string[];
  addDays: (d: string, n: number) => string;
}
export const S = {} as State;

let nikSeq = 0;
export const newNik = () => "3515" + String(100_000_000_000 + ++nikSeq);
let ipSeq = 0;
export const freshIp = () => `10.20.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;

export interface RegSpec { name?: string; nik?: string; mrn?: string; date?: string; clinicId?: string; kk?: string | null; ip?: string; expect?: number }

// Validasi nama menolak angka (nama orang), jadi nama uji dibentuk dari huruf saja.
const letters = (n: number) => String(n).replace(/\d/g, (d) => "abcdefghij"[Number(d)]);
export interface Reg { res: Res; visitId: string; token: string; ticket: string }

export async function register(spec: RegSpec = {}): Promise<Reg> {
  const c = new Client("pasien", spec.ip ?? freshIp());
  const n = nikSeq + 1;
  const res = await c.post("/api/v1/patient-visits", {
    national_identity_number: spec.nik ?? newNik(),
    family_card_number: spec.kk ?? null,
    medical_record_number: spec.mrn ?? `RM-9${String(n).padStart(5, "0")}`,
    display_name: spec.name ?? `Pasien Uji ${letters(n)}`,
    hospital_id: S.hospitalId,
    service_unit_id: spec.clinicId ?? S.clinicId,
    visit_date: spec.date ?? S.today,
  });
  const want = spec.expect ?? 201;
  if (res.status !== want) {
    // Gagal keras: id kosong akan menghasilkan URL seperti /visits//queue dan kegagalan lanjutan yang membingungkan.
    throw new Error(`register(${spec.name ?? "default"}) -> ${res.status}, diharapkan ${want}: ${res.text.slice(0, 200)}`);
  }
  const d = res.json?.data;
  const url = d?.access_url ? new URL(d.access_url) : null;
  const token = url ? url.hash.slice(1) : "";
  if (token) S.secrets.push(token);
  return { res, visitId: d?.visit?.id ?? "", token, ticket: d?.ticket?.ticket_number ?? "" };
}

export const q = async (sql: string, p: unknown[] = []) => (await S.pool.query(sql, p)).rows;
export const count = async (sql: string, p: unknown[] = []) => Number((await q(sql, p))[0].n);
