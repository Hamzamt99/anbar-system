import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { wrangler } from "./wrangler-util.js";
const root = "tmp/recovery-" + process.pid,
  source = root + "/source/.wrangler/state",
  target = root + "/restored",
  sql = root + "/backup.sql";
mkdirSync(root, { recursive: true, mode: 0o700 });
const execute = (persist, command) =>
  JSON.parse(
    wrangler([
      "d1",
      "execute",
      "anbar-db",
      "--local",
      "--persist-to",
      persist,
      "--json",
      "--command",
      command,
    ]),
  );
try {
  wrangler([
    "d1",
    "migrations",
    "apply",
    "anbar-db",
    "--local",
    "--persist-to",
    source,
  ]);
  execute(
    source,
    "INSERT INTO users(email,password_hash,role) VALUES('synthetic@example.invalid','not-a-login-hash','SUPER_ADMIN'); INSERT INTO customers(name) VALUES('Synthetic customer'); INSERT INTO drivers(name) VALUES('Synthetic driver'); INSERT INTO mix_types(name) VALUES('Synthetic mix'); INSERT INTO vehicles(name) VALUES('Synthetic truck'); INSERT INTO pumps(name) VALUES('Synthetic pump'); INSERT INTO invoices(customer_id,driver_id,mix_type_id,vehicle_id,pump_id,customer_name,driver_name,mix_type_name,vehicle_name,pump_name,date,pour_location,requested,truck_load,departure,arrival,finish,receiver,created_by,audit_actor_email) VALUES(1,1,1,1,1,'Synthetic customer','Synthetic driver','Synthetic mix','Synthetic truck','Synthetic pump','2026-01-01','Synthetic site',20000,10000,'10:00','','','',1,'synthetic@example.invalid');",
  );
  execute(
    source,
    "INSERT INTO invoices(customer_id,driver_id,mix_type_id,vehicle_id,pump_id,customer_name,driver_name,mix_type_name,vehicle_name,pump_name,date,pour_location,requested,truck_load,departure,arrival,finish,receiver,created_by,audit_actor_email) SELECT customer_id,driver_id,mix_type_id,vehicle_id,pump_id,customer_name,driver_name,mix_type_name,vehicle_name,pump_name,date,pour_location,requested,truck_load,departure,arrival,finish,receiver,created_by,audit_actor_email FROM invoices WHERE id=1;",
  );
  const inspect =
    "SELECT (SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM invoices) AS invoices,(SELECT COUNT(*) FROM customers) AS customers,(SELECT COUNT(*) FROM drivers) AS drivers,(SELECT COUNT(*) FROM mix_types) AS mixes,(SELECT COUNT(*) FROM vehicles) AS vehicles,(SELECT COUNT(*) FROM pumps) AS pumps,(SELECT COUNT(*) FROM mixers) AS mixers,(SELECT COUNT(*) FROM audit_logs) AS audit_logs,(SELECT SUM(cumulative) FROM invoices) AS cumulative,(SELECT COUNT(*) FROM sqlite_master WHERE type='trigger') AS triggers; PRAGMA foreign_key_check;";
  const before = execute(source, inspect).map((r) => r.results);
  const start = performance.now();
  mkdirSync(root + "/source", { recursive: true });
  writeFileSync(
    root + "/source/wrangler.json",
    JSON.stringify({
      name: "anbar-recovery",
      compatibility_date: "2026-11-16",
      d1_databases: [
        {
          binding: "DB",
          database_name: "anbar-db",
          database_id: "04b6d257-131e-4b69-9502-fd016f55ee0d",
        },
      ],
    }),
  );
  wrangler([
    "d1",
    "export",
    "anbar-db",
    "--local",
    "--config",
    root + "/source/wrangler.json",
    "--output",
    sql,
  ]);
  // Disposable key without a passphrase is for this synthetic drill only; production keys stay offline/protected.
  const keyring = root + "/gpg";
  mkdirSync(keyring, { mode: 0o700 });
  const gpg = (args) => {
    const r = spawnSync(
      "gpg",
      ["--homedir", keyring, "--batch", "--yes", ...args],
      { encoding: "utf8" },
    );
    if (r.status !== 0)
      throw Error("Synthetic backup encryption/decryption failed");
    return r.stdout;
  };
  gpg([
    "--pinentry-mode",
    "loopback",
    "--passphrase",
    "",
    "--quick-generate-key",
    "Synthetic recovery <synthetic@example.invalid>",
    "rsa2048",
    "encr",
    "1d",
  ]);
  const fingerprint = gpg(["--with-colons", "--list-keys"])
    .split("\n")
    .find((line) => line.startsWith("fpr:"))
    .split(":")[9];
  gpg([
    "--trust-model",
    "always",
    "--encrypt",
    "--recipient",
    fingerprint,
    "--output",
    root + "/backup.sql.gpg",
    sql,
  ]);
  gpg([
    "--decrypt",
    "--output",
    root + "/decrypted.sql",
    root + "/backup.sql.gpg",
  ]);
  const sha = (file) =>
    createHash("sha256").update(readFileSync(file)).digest("hex");
  if (sha(sql) !== sha(root + "/decrypted.sql"))
    throw Error("Decrypted backup differs from original export");
  const prepared = root + "/restore.sql";
  if (
    spawnSync(
      "python3",
      ["scripts/prepare-restore.py", root + "/decrypted.sql", prepared],
      {
        stdio: "inherit",
      },
    ).status !== 0
  )
    throw new Error("Restore preparation failed");
  wrangler([
    "d1",
    "execute",
    "anbar-db",
    "--local",
    "--persist-to",
    target,
    "--file",
    prepared,
  ]);
  const after = execute(target, inspect).map((r) => r.results);
  if (JSON.stringify(before) !== JSON.stringify(after) || after[1].length)
    throw new Error("Restore verification mismatch");
  execute(target, "UPDATE invoices SET truck_load=12000 WHERE id=1;");
  const row = execute(target, "SELECT cumulative FROM invoices WHERE id=1;")[0]
    .results[0];
  if (row.cumulative !== 12000)
    throw new Error("Restored quantity trigger failed");
  const second = execute(
    target,
    "SELECT previous,cumulative FROM invoices WHERE id=2;",
  )[0].results[0];
  if (second.previous !== 12000 || second.cumulative !== 22000)
    throw new Error("Restored downstream recalculation failed");
  for (const file of [
    "rollbacks/0007_query_performance.sql",
    "rollbacks/0006_invoice_integrity.sql",
    "migrations/0006_invoice_integrity.sql",
    "migrations/0007_query_performance.sql",
  ])
    wrangler([
      "d1",
      "execute",
      "anbar-db",
      "--local",
      "--persist-to",
      target,
      "--file",
      file,
    ]);
  const checked = execute(
    target,
    "SELECT COUNT(*) AS n FROM invoices; PRAGMA foreign_key_check;",
  );
  if (checked[0].results[0].n !== 2 || checked[1].results.length)
    throw new Error("Down/up migration cycle lost integrity");
  const result = {
    encrypted_export_round_trip_verified: true,
    down_up_migration_cycle_verified: true,
    environment: "two isolated local D1 databases",
    counts_and_relationships_match: true,
    foreign_key_errors: 0,
    restored_triggers_verified: true,
    export_restore_verify_ms: Math.round(performance.now() - start),
    before,
  };
  mkdirSync("tmp/optimization", { recursive: true });
  writeFileSync(
    "tmp/optimization/recovery.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  rmSync(root, { recursive: true, force: true });
}
