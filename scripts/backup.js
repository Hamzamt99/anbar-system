import {
  mkdirSync,
  mkdtempSync,
  chmodSync,
  rmSync,
  readdirSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { wrangler } from "./wrangler-util.js";
const directory = process.env.ANBAR_BACKUP_DIR,
  recipient = process.env.ANBAR_BACKUP_RECIPIENT;
if (!directory || !recipient)
  throw new Error(
    "Set ANBAR_BACKUP_DIR and ANBAR_BACKUP_RECIPIENT (GPG public-key fingerprint). No plaintext backup fallback.",
  );
mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);
const temp = mkdtempSync(join(tmpdir(), "anbar-backup-"));
chmodSync(temp, 0o700);
try {
  const sql = join(temp, "database.sql");
  wrangler(["d1", "export", "anbar-db", "--remote", "--output", sql]);
  chmodSync(sql, 0o600);
  const path = join(
    resolve(directory),
    "anbar-" + new Date().toISOString().replaceAll(":", "-") + ".sql.gpg",
  );
  const result = spawnSync(
    "gpg",
    [
      "--batch",
      "--yes",
      "--trust-model",
      "always",
      "--encrypt",
      "--recipient",
      recipient,
      "--output",
      path,
      sql,
    ],
    { stdio: "pipe" },
  );
  if (result.status !== 0)
    throw new Error(
      "Encryption failed; check GPG recipient. Plaintext temporary export will be removed.",
    );
  chmodSync(path, 0o600);
  for (const name of readdirSync(directory))
    if (
      /^anbar-[\dTZ.:-]+\.sql\.gpg$/.test(name) &&
      Date.now() - statSync(join(directory, name)).mtimeMs > 30 * 86400000
    )
      rmSync(join(directory, name));
  console.log("Encrypted backup created; 30-day retention applied.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
