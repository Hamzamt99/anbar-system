// Prepare an emergency baseline Worker that can still verify upgraded passwords.
// Never checks out, changes, merges or pushes main. No production access.
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { resolve } from "node:path";
const directory = resolve("tmp/optimization/rollback-worker");
rmSync(directory, { recursive: true, force: true });
mkdirSync(directory, { recursive: true });
const archive = spawnSync("git", ["archive", "9b3d188"], {
  maxBuffer: 8 * 1024 * 1024,
});
if (
  archive.status !== 0 ||
  spawnSync("tar", ["-x", "-C", directory], { input: archive.stdout })
    .status !== 0
)
  throw Error("Cannot prepare baseline archive");
symlinkSync(resolve("node_modules"), directory + "/node_modules", "dir");
let crypto = readFileSync("server/services/crypto.js", "utf8").replace(
  "PASSWORD_ITERATIONS = 600000",
  "PASSWORD_ITERATIONS = 100000",
);
writeFileSync(directory + "/server/services/crypto.js", crypto);
// Retain current response privacy, HTML headers and sanitized API logs on rollback.
for (const file of ["server/security.js", "server/worker.js"])
  copyFileSync(file, directory + "/" + file);
let app = readFileSync(directory + "/server/app.js", "utf8").replace(
  "console.error(err)",
  "console.error(JSON.stringify({event:'internal_error',status:500}))",
);
writeFileSync(directory + "/server/app.js", app);
let service = readFileSync(
  directory + "/server/services/invoices.js",
  "utf8",
).replace(
  "    ...row,",
  '    ...Object.fromEntries(Object.entries(row).filter(([key])=>!["idempotency_key","request_hash","creation_response"].includes(key))),',
);
writeFileSync(directory + "/server/services/invoices.js", service);
const config = JSON.parse(
  readFileSync(directory + "/wrangler.jsonc", "utf8").replace(
    /,\s*([}\]])/g,
    "$1",
  ),
);
config.assets.run_worker_first = true;
config.limits = { cpu_ms: 3000 };
writeFileSync(directory + "/wrangler.jsonc", JSON.stringify(config, null, 2));
for (const args of [["run", "build"], ["test"]]) {
  const r = spawnSync("npm", args, { cwd: directory, encoding: "utf8" });
  writeFileSync(
    "tmp/optimization/rollback-verify-" + args.at(-1) + ".log",
    r.stdout + r.stderr,
  );
  if (r.status !== 0) throw Error("Rollback verification failed");
}
console.log(
  "Rollback baseline built and API-tested; dual hash verification retained. Deploy only on the Paid plan.",
);
