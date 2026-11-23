// Explicitly isolated, disposable staging only. Never point this at production.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { hashPassword, token } from "../server/services/crypto.js";
import { wrangler } from "./wrangler-util.js";
const configPath = process.argv[2] || "tmp/optimization/staging.wrangler.jsonc";
const base =
  process.argv[3] || "https://anbar-hardening-staging.anbar-system.workers.dev";
const config = JSON.parse(readFileSync(configPath, "utf8")),
  database = config.d1_databases[0];
assert.equal(config.name, "anbar-hardening-staging");
assert.match(new URL(base).hostname, /^anbar-hardening-staging\./);
assert.equal(new URL(base).protocol, "https:");
assert.notEqual(database.database_name, "anbar-db");
assert.notEqual(database.database_id, "04b6d257-131e-4b69-9502-fd016f55ee0d");
const sql = (command) =>
  JSON.parse(
    wrangler([
      "d1",
      "execute",
      database.database_name,
      "--remote",
      "--config",
      configPath,
      "--json",
      "--command",
      command,
    ]),
  );
assert.equal(
  sql("SELECT COUNT(*) AS n FROM users;")[0].results[0].n,
  0,
  "Use a fresh staging database; do not overwrite existing accounts",
);
const password = token() + "aA1!",
  seed = "tmp/optimization/staging-smoke-seed.sql",
  cookies = {},
  results = {};
const before = Date.now();
try {
  const users = [];
  for (const [email, role, cost] of [
    ["stage-super@example.invalid", "SUPER_ADMIN", 100000],
    ["stage-admin@example.invalid", "ADMIN", 600000],
    ["stage-entry@example.invalid", "DATA_ENTRY", 600000],
  ]) {
    users.push(
      `INSERT INTO users(email,password_hash,role) VALUES('${email}','${await hashPassword(password, undefined, cost)}','${role}');`,
    );
  }
  writeFileSync(seed, users.join("\n"), { mode: 0o600 });
  wrangler([
    "d1",
    "execute",
    database.database_name,
    "--remote",
    "--config",
    configPath,
    "--file",
    seed,
  ]);
  const request = async (
    path,
    {
      method = "GET",
      body,
      role = "SUPER_ADMIN",
      status = 200,
      headers = {},
    } = {},
  ) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookies[role] ? { Cookie: cookies[role] } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(
      r.status,
      status,
      `Unexpected staging status on ${method} ${path}`,
    );
    assert.equal(r.headers.get("cache-control"), "no-store");
    return { body: await r.json(), headers: r.headers };
  };
  for (const [email, role] of [
    ["stage-super@example.invalid", "SUPER_ADMIN"],
    ["stage-admin@example.invalid", "ADMIN"],
    ["stage-entry@example.invalid", "DATA_ENTRY"],
  ]) {
    const r = await request("/auth/login", {
      method: "POST",
      body: { email, password },
      role: "none",
    });
    const cookie = r.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
    cookies[role] = cookie.split(";")[0];
  }
  results.hosted_legacy_and_new_password_logins = true;
  results.secure_cookies = true;
  assert.equal(
    sql(
      "SELECT password_hash LIKE 'pbkdf2$600000$%' AS upgraded FROM users WHERE email='stage-super@example.invalid';",
    )[0].results[0].upgraded,
    1,
  );
  results.legacy_rehash_verified = true;
  const refs = {};
  for (const [path, key] of [
    ["customers", "customer_id"],
    ["drivers", "driver_id"],
    ["mix-types", "mix_type_id"],
    ["vehicles", "vehicle_id"],
    ["pumps", "pump_id"],
  ])
    refs[key] = (
      await request("/" + path, {
        method: "POST",
        body: { name: "Synthetic staging " + path },
        status: 201,
      })
    ).body.data.id;
  const body = {
    ...refs,
    date: "2026-01-01",
    pour_location: "Synthetic staging site",
    requested: "10",
    truck_load: "1",
    departure: "10:00",
  };
  const key = crypto.randomUUID(),
    create = () =>
      request("/invoices", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": key },
        status: 201,
      });
  const creations = await Promise.all(Array.from({ length: 6 }, create)),
    row = creations[0].body.data;
  assert.equal(new Set(creations.map((r) => r.body.data.id)).size, 1);
  assert.equal((await request("/invoices")).body.total, 1);
  results.six_simultaneous_submissions_one_invoice = true;
  const edit = (receiver) =>
    fetch(base + "/api/invoices/" + row.id, {
      method: "PUT",
      headers: {
        Cookie: cookies.SUPER_ADMIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, receiver, version: row.version }),
    });
  const edits = await Promise.all([
    edit("Synthetic one"),
    edit("Synthetic two"),
  ]);
  assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
  results.conflicting_edits_rejected = true;
  const replay = await create();
  assert.deepEqual(replay.body.data, row);
  results.original_creation_replay_preserved = true;
  const current = (await request("/invoices/" + row.id)).body.data;
  await request("/invoices/" + row.id + "/print", {
    method: "POST",
    body: {},
    role: "ADMIN",
  });
  const printed = (await request("/invoices/" + row.id)).body.data;
  assert.equal(printed.cumulative, current.cumulative);
  assert.equal(printed.previous, current.previous);
  await request("/invoices/" + row.id, {
    method: "PUT",
    body: { ...body, version: printed.version },
    role: "ADMIN",
    status: 403,
  });
  await request("/invoices/" + row.id, {
    method: "PUT",
    body: { ...body, version: printed.version },
    status: 200,
  });
  await request("/users", { role: "DATA_ENTRY", status: 403 });
  await request("/audit-logs", { role: "ADMIN", status: 403 });
  results.print_permissions_and_stable_totals = true;
  const html = await fetch(base);
  assert.match(
    html.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.ok(html.headers.get("strict-transport-security"));
  results.hosted_headers = true;
  results.elapsed_ms = Date.now() - before;
  results.environment =
    "Disposable remote staging Worker and D1; no production writes";
  writeFileSync(
    "tmp/optimization/staging-smoke.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  rmSync(seed, { force: true });
}
