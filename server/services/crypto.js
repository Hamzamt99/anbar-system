const hex = (b) =>
  Array.from(new Uint8Array(b), (v) => v.toString(16).padStart(2, "0")).join(
    "",
  );
const bytes = (s) =>
  Uint8Array.from(s.match(/../g) || [], (v) => parseInt(v, 16));
export async function hashPassword(
  password,
  salt = hex(crypto.getRandomValues(new Uint8Array(16))),
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: bytes(salt), iterations: 100000, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$100000$${salt}$${hex(hash)}`;
}
export async function verifyPassword(password, stored) {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[1] !== "100000") return false;
  const actual = await hashPassword(password, parts[2]);
  let diff = actual.length ^ stored.length;
  for (let i = 0; i < stored.length; i++)
    diff |= actual.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}
export const token = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value) {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}
