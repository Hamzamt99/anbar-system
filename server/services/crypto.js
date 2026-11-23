import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { timingSafeEqual } from "node:crypto";
const hex = (b) =>
  Array.from(new Uint8Array(b), (v) => v.toString(16).padStart(2, "0")).join(
    "",
  );
const bytes = (s) =>
  Uint8Array.from(s.match(/../g) || [], (v) => parseInt(v, 16));
export const PASSWORD_ITERATIONS = 600000;
export async function hashPassword(
  password,
  salt = hex(crypto.getRandomValues(new Uint8Array(16))),
  iterations = PASSWORD_ITERATIONS,
) {
  // Noble avoids the hosted Workers native PBKDF2 100k cap. Format remains legacy-compatible.
  const hash = pbkdf2(sha256, new TextEncoder().encode(password), bytes(salt), {
    c: iterations,
    dkLen: 32,
  });
  return `pbkdf2$${iterations}$${salt}$${hex(hash)}`;
}
export function needsRehash(stored) {
  return stored.split("$")[1] !== String(PASSWORD_ITERATIONS);
}
export async function verifyPassword(password, stored) {
  if (!/^pbkdf2\$(100000|600000)\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(stored))
    return false;
  const [, iterations, salt] = stored.split("$");
  const actual = await hashPassword(password, salt, Number(iterations));
  return timingSafeEqual(
    new TextEncoder().encode(actual),
    new TextEncoder().encode(stored),
  );
}
export const token = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value) {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}
