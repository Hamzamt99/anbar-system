import readline from "node:readline";
import { Writable } from "node:stream";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, email, password } from "../server/validation/index.js";
import { hashPassword } from "../server/services/crypto.js";
let muted = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const rl = readline.createInterface({
  input: process.stdin,
  output,
  terminal: process.stdin.isTTY,
});
const ask = (q) => new Promise((r) => rl.question(q, r));
let dir;
try {
  const address = parse(email, await ask("Super Admin email: "));
  process.stdout.write("Password (12+ characters, hidden): ");
  muted = true;
  const secret = parse(password, await ask(""));
  muted = false;
  console.log();
  rl.close();
  const hash = await hashPassword(secret);
  dir = mkdtempSync(join(tmpdir(), "anbar-admin-"));
  const file = join(dir, "admin.sql");
  const quote = (v) => "'" + v.replaceAll("'", "''") + "'";
  writeFileSync(
    file,
    `INSERT INTO users(email,password_hash,role) VALUES(${quote(address)},${quote(hash)},'SUPER_ADMIN');`,
    { mode: 0o600 },
  );
  const remote = process.argv.includes("--remote");
  const r = spawnSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "anbar-db",
      remote ? "--remote" : "--local",
      "--file",
      file,
    ],
    { stdio: "inherit" },
  );
  process.exitCode = r.status ?? 1;
} catch (e) {
  muted = false;
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
}
