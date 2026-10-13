import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const N = 16384, r = 8, p = 1, LEN = 32;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, LEN, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, rr, pp, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const want = Buffer.from(hash, "base64url");
  const got = await scrypt(pw, Buffer.from(salt, "base64url"), want.length, { N: +n, r: +rr, p: +pp });
  return timingSafeEqual(got, want);
}

/** Hash for one-time codes and reset tokens (they are random, so no salt/stretching needed). */
export const sha256 = (s: string) => createHash("sha256").update(s).digest("base64url");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
/** 6-digit numeric code. */
export const randomCode = () => String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
