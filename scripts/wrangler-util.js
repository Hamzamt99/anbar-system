import { spawnSync } from "node:child_process";
export function wrangler(args) {
  const r = spawnSync(
    process.execPath,
    ["node_modules/wrangler/wrangler-dist/cli.js", ...args],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (r.status !== 0)
    throw new Error(
      "Wrangler operation failed (output suppressed to protect export URLs and data)",
    );
  return r.stdout;
}
