import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

/** Token akses tiket / sesi: 32 byte acak, base64url. Tidak memuat identitas apa pun (PRD §13.3). */
export const newToken = (): string => randomBytes(32).toString("base64url");

/** Hanya hash yang disimpan di database (PRD §13.4). */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, keylen: number, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Hash adaptif (scrypt) dengan salt acak. Format: scrypt$N$r$p$salt$hash (PRD §13.8). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let dummy: Promise<string> | null = null;
/** Verifikasi palsu agar waktu respons login tidak membedakan username yang ada dan tidak ada. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(password, await dummy);
}
