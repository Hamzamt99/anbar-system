import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createApp } from "../server/app.js";
import { hashPassword, verifyPassword } from "../server/services/crypto.js";
let mf, db, server, base;
const cookies = {};
const secret = "Testing-password-2026";
let refs, first, second, third;
async function call(
  path,
  { role = "SUPER_ADMIN", method = "GET", body, status, headers = {} } = {},
) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookies[role] ? { Cookie: cookies[role] } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  assert.equal(
    r.status,
    status ??
      (method === "POST" &&
      /^\/(customers|drivers|mix-types|vehicles|pumps|users|invoices)$/.test(
        path,
      )
        ? 201
        : 200),
    JSON.stringify(data),
  );
  return { data: data.data, ...data, cookie: r.headers.get("set-cookie") };
}
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "test",
          modules: true,
          script: 'export default {fetch(){return new Response("ok")}}',
          compatibilityDate: "2026-11-16",
          d1Databases: ["DB"],
        },
      ],
    }),
  );
  db = await mf.getD1Database("DB");
  for (const file of (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL("../migrations/" + file, import.meta.url),
      "utf8",
    );
    const [tables, ...triggers] = sql.split("CREATE TRIGGER");
    for (const stmt of tables
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean))
      await db.prepare(stmt).run();
    for (const trigger of triggers)
      await db.prepare("CREATE TRIGGER" + trigger).run();
  }
  for (const role of ["SUPER_ADMIN", "ADMIN", "DATA_ENTRY"])
    await db
      .prepare("INSERT INTO users(email,password_hash,role) VALUES(?,?,?)")
      .bind(
        role.toLowerCase() + "@example.com",
        await hashPassword(secret),
        role,
      )
      .run();
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (mf) await mf.dispose();
});
test("password hashing uses random salts and verifies securely", async () => {
  const a = await hashPassword(secret),
    b = await hashPassword(secret);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(secret, a), true);
  assert.equal(await verifyPassword("wrong", a), false);
  assert.ok(!a.includes(secret));
});
test("authentication, cookie flags, unauthenticated requests, invalid login and CSRF", async () => {
  await call("/invoices", { role: "none", status: 401 });
  await call("/auth/login", {
    role: "none",
    method: "POST",
    body: { email: "admin@example.com", password: "wrong" },
    status: 401,
  });
  for (const role of ["SUPER_ADMIN", "ADMIN", "DATA_ENTRY"]) {
    const r = await call("/auth/login", {
      role: "none",
      method: "POST",
      body: { email: role.toLowerCase() + "@example.com", password: secret },
    });
    assert.match(r.cookie, /HttpOnly/);
    assert.match(r.cookie, /SameSite=Strict/);
    cookies[role] = r.cookie.split(";")[0];
    assert.equal((await call("/auth/me", { role })).data.role, role);
  }
  await call("/customers", {
    method: "POST",
    body: { name: "CSRF" },
    headers: { Origin: "https://evil.example" },
    status: 403,
  });
});
test("roles and master-data validation", async () => {
  await call("/users", { role: "ADMIN", status: 403 });
  await call("/users", { role: "DATA_ENTRY", status: 403 });
  await call("/customers", {
    method: "POST",
    role: "DATA_ENTRY",
    body: { name: "Forbidden" },
    status: 403,
  });
  refs = {};
  for (const [key, path] of [
    ["customer_id", "customers"],
    ["driver_id", "drivers"],
    ["mix_type_id", "mix-types"],
    ["vehicle_id", "vehicles"],
    ["pump_id", "pumps"],
  ])
    refs[key] = (
      await call("/" + path, { method: "POST", body: { name: path } })
    ).data.id;
  await call("/customers", {
    method: "POST",
    body: { name: "customers" },
    status: 409,
  });
  await call("/customers", { method: "POST", body: { name: "" }, status: 400 });
});
const invoice = (overrides = {}) => ({
  ...refs,
  date: "2026-11-14",
  pour_location: "البنيات",
  requested: "30",
  truck_load: "10",
  departure: "12:00",
  arrival: "12:30",
  finish: "13:00",
  receiver: "أحمد",
  chemicals: "",
  added_water: "",
  ...overrides,
});
test("server quantities, exact decimals, deterministic ordering and reset by date/customer", async () => {
  first = (
    await call("/invoices", {
      role: "DATA_ENTRY",
      method: "POST",
      body: invoice(),
    })
  ).data;
  second = (await call("/invoices", { method: "POST", body: invoice() })).data;
  third = (await call("/invoices", { method: "POST", body: invoice() })).data;
  assert.equal(first.previous, 0);
  assert.equal(first.cumulative, 10);
  assert.equal(second.previous, 10);
  assert.equal(second.cumulative, 20);
  assert.equal(third.previous, 20);
  assert.equal(third.cumulative, 30);
  const dateReset = await call("/invoices", {
    method: "POST",
    body: invoice({ date: "2026-11-15", truck_load: ".1" }),
    status: 400,
  });
  const otherDate = (
    await call("/invoices", {
      method: "POST",
      body: invoice({ date: "2026-11-15", truck_load: "0.1" }),
    })
  ).data;
  assert.equal(otherDate.previous, 0);
  const decimal = (
    await call("/invoices", {
      method: "POST",
      body: invoice({ date: "2026-11-15", truck_load: "0.2" }),
    })
  ).data;
  assert.equal(decimal.cumulative, 0.3);
  const customer = (
    await call("/customers", { method: "POST", body: { name: "عميل آخر" } })
  ).data;
  const other = (
    await call("/invoices", {
      method: "POST",
      body: invoice({ customer_id: customer.id }),
    })
  ).data;
  assert.equal(other.previous, 0);
  await call("/invoices", {
    method: "POST",
    body: invoice({ previous: 999, cumulative: 999 }),
    status: 400,
  });
});
test("invoices require exactly the specified manual fields and allow omitted optional fields", async () => {
  const minimal = invoice({ date: "2026-12-01" });
  for (const key of [
    "arrival",
    "finish",
    "receiver",
    "chemicals",
    "added_water",
  ])
    delete minimal[key];
  const row = (await call("/invoices", { method: "POST", body: minimal })).data;
  for (const key of [
    "arrival",
    "finish",
    "receiver",
    "chemicals",
    "added_water",
  ])
    assert.equal(row[key], "");
  assert.equal(row.departure, "12:15");
  assert.equal(row.departure_input, "12:00");
  const savedAgain = (
    await call("/invoices/" + row.id, { method: "PUT", body: minimal })
  ).data;
  assert.equal(savedAgain.departure, "12:15");
  const midnight = { ...minimal, departure: "23:50" };
  const adjusted = (
    await call("/invoices/" + row.id, { method: "PUT", body: midnight })
  ).data;
  assert.equal(adjusted.departure, "00:05");
  assert.equal(adjusted.departure_input, "23:50");
  assert.equal(adjusted.date, minimal.date);
  const repeated = (
    await call("/invoices/" + row.id, {
      method: "PUT",
      body: { ...midnight, receiver: "مستلم اختياري" },
    })
  ).data;
  assert.equal(repeated.departure, "00:05");
  assert.equal(repeated.arrival, "");
  await call("/invoices", {
    method: "POST",
    body: { ...minimal, departure_input: "10:00" },
    status: 400,
  });
  // Legacy records retain their historical departure on unrelated edits.
  await db
    .prepare("UPDATE invoices SET departure=?,departure_input=NULL WHERE id=?")
    .bind("08:00", row.id)
    .run();
  const legacy = (
    await call("/invoices/" + row.id, {
      method: "PUT",
      body: { ...minimal, departure: "08:00" },
    })
  ).data;
  assert.equal(legacy.departure, "08:00");
  const legacyChanged = (
    await call("/invoices/" + row.id, {
      method: "PUT",
      body: { ...minimal, departure: "08:10" },
    })
  ).data;
  assert.equal(legacyChanged.departure, "08:25");
  for (const key of [
    "customer_id",
    "pour_location",
    "date",
    "driver_id",
    "vehicle_id",
    "pump_id",
    "requested",
    "truck_load",
    "departure",
    "mix_type_id",
  ]) {
    const invalid = { ...minimal };
    delete invalid[key];
    await call("/invoices", { method: "POST", body: invalid, status: 400 });
  }
  await call("/invoices", {
    method: "POST",
    body: { ...minimal, finish: "25:00" },
    status: 400,
  });
  await call("/invoices", {
    method: "POST",
    body: { ...minimal, arrival: "25:00" },
    status: 400,
  });
});
test("parallel invoice writes maintain correct integer totals", async () => {
  const created = await Promise.all(
    Array.from({ length: 8 }, () =>
      call("/invoices", {
        method: "POST",
        body: invoice({ date: "2026-11-16", truck_load: "0.125" }),
      }),
    ),
  );
  const stored = (
    await db
      .prepare(
        "SELECT * FROM invoices WHERE date='2026-11-16' ORDER BY created_at,id",
      )
      .all()
  ).results;
  assert.equal(stored.length, 8);
  stored.forEach((r, i) => {
    assert.equal(r.previous, i * 125);
    assert.equal(r.cumulative, (i + 1) * 125);
  });
});
test("preview is read-only; print locks ADMIN; SUPER_ADMIN edit recalculates following invoices", async () => {
  assert.equal(
    (await call("/invoices/" + first.id, { role: "DATA_ENTRY" })).data
      .printed_at,
    null,
  );
  await call("/invoices/" + first.id + "/print", {
    role: "DATA_ENTRY",
    method: "POST",
    body: {},
    status: 403,
  });
  await call("/invoices/" + first.id + "/print", {
    role: "ADMIN",
    method: "POST",
    body: {},
  });
  await call("/invoices/" + first.id, {
    role: "ADMIN",
    method: "PUT",
    body: invoice({ truck_load: 12 }),
    status: 403,
  });
  await call("/invoices/" + second.id, {
    role: "DATA_ENTRY",
    method: "PUT",
    body: invoice(),
    status: 403,
  });
  await call("/invoices/" + first.id, {
    method: "PUT",
    body: invoice({ truck_load: 12 }),
  });
  assert.equal((await call("/invoices/" + second.id)).data.previous, 12);
  assert.equal((await call("/invoices/" + third.id)).data.cumulative, 32);
  await call("/invoices/" + first.id, {
    method: "PUT",
    body: invoice({ date: "2026-11-15", truck_load: 12 }),
  });
  assert.equal((await call("/invoices/" + second.id)).data.previous, 0);
  assert.equal((await call("/invoices/" + third.id)).data.cumulative, 20);
  assert.equal((await call("/invoices/" + first.id)).data.previous, 0);
  const moved = await db
    .prepare(
      "SELECT cumulative FROM invoices WHERE date='2026-11-15' ORDER BY created_at DESC,id DESC LIMIT 1",
    )
    .first();
  assert.equal(moved.cumulative, 12300);
});
test("changing customer recalculates both groups and preserves snapshots on rename/delete", async () => {
  const customer = (
    await call("/customers", {
      method: "POST",
      body: { name: "العميل الجديد" },
    })
  ).data;
  await call("/invoices/" + second.id, {
    method: "PUT",
    body: invoice({ customer_id: customer.id, truck_load: 7 }),
  });
  assert.equal((await call("/invoices/" + third.id)).data.previous, 0);
  assert.equal((await call("/invoices/" + second.id)).data.cumulative, 7);
  await call("/customers/" + refs.customer_id, {
    method: "PUT",
    body: { name: "اسم معدل" },
  });
  assert.equal(
    (await call("/invoices/" + third.id)).data.customer_name,
    "customers",
  );
  await call("/drivers/" + refs.driver_id, { method: "DELETE", body: {} });
  assert.equal(
    (await call("/invoices/" + third.id)).data.driver_name,
    "drivers",
  );
  await call("/invoices/" + third.id, {
    method: "PUT",
    body: invoice({ truck_load: 9 }),
  });
  await call("/invoices", { method: "POST", body: invoice(), status: 400 });
});
test("API validation and server-side invoice filters", async () => {
  const activeDrivers = (await call("/drivers")).data;
  const allDrivers = (await call("/drivers?include_deleted=1")).data;
  assert.equal(
    activeDrivers.some((x) => x.id === refs.driver_id),
    false,
  );
  assert.equal(
    allDrivers.some((x) => x.id === refs.driver_id),
    true,
  );
  await call("/drivers?include_deleted=1", { role: "DATA_ENTRY", status: 403 });

  await call("/invoices?from=2026-11-20&to=2026-11-01", { status: 400 });
  await call("/invoices?from=2026-02-30", { status: 400 });
  await call("/invoices?page=-1", { status: 400 });
  await call("/invoices?customer_id=1", { role: "DATA_ENTRY", status: 403 });
  const r = await call("/invoices?from=2026-11-16&to=2026-11-16");
  assert.equal(r.total, 8);
  for (const patch of [
    { requested: -1 },
    { truck_load: "1.0001" },
    { departure: "25:00" },
    { customer_id: 999999 },
    { pump_id: null },
  ])
    await call("/invoices", {
      method: "POST",
      body: invoice(patch),
      status: 400,
    });
  await call("/invoices/999999", { status: 404 });
});
test("user lifecycle, session invalidation and self-protection", async () => {
  await call("/users", {
    method: "POST",
    body: { email: "bad", password: secret, role: "ADMIN" },
    status: 400,
  });
  await call("/users", {
    method: "POST",
    body: { email: "new@example.com", password: "short", role: "ADMIN" },
    status: 400,
  });
  const u = (
    await call("/users", {
      method: "POST",
      body: { email: "new@example.com", password: secret, role: "ADMIN" },
    })
  ).data;
  const login = await call("/auth/login", {
    role: "none",
    method: "POST",
    body: { email: u.email, password: secret },
  });
  cookies.temp = login.cookie.split(";")[0];
  await call("/users/" + u.id, {
    method: "PUT",
    body: { email: u.email, role: "DATA_ENTRY" },
  });
  await call("/auth/me", { role: "temp", status: 401 });
  await call("/users/" + u.id + "/password", {
    method: "POST",
    body: { password: "New-password-2026" },
  });
  await call("/auth/login", {
    role: "none",
    method: "POST",
    body: { email: u.email, password: secret },
    status: 401,
  });
  await call("/users/" + u.id, { method: "DELETE", body: {} });
  const me = (await call("/auth/me")).data;
  await call("/users/" + me.id, { method: "DELETE", body: {}, status: 400 });
  await call("/auth/logout", { role: "ADMIN", method: "POST", body: {} });
  await call("/auth/me", { role: "ADMIN", status: 401 });
});

test("audit logs attribute invoice changes, remain immutable, and restrict access", async () => {
  await call("/audit-logs", { role: "none", status: 401 });
  await call("/audit-logs", { role: "DATA_ENTRY", status: 403 });
  // The ADMIN session was logged out in the lifecycle test; authenticate it again.
  const session = await call("/auth/login", {
    role: "none",
    method: "POST",
    body: { email: "admin@example.com", password: secret },
  });
  cookies.ADMIN = session.cookie.split(";")[0];
  await call("/audit-logs", { role: "ADMIN", status: 403 });
  const history = (await call("/audit-logs?invoice_id=" + first.id)).data;
  assert.deepEqual(
    history.map((x) => x.action).sort(),
    ["CREATE", "PRINT", "UPDATE", "UPDATE"].sort(),
  );
  assert.equal(
    history.find((x) => x.action === "CREATE").actor_email,
    "data_entry@example.com",
  );
  assert.equal(
    history.find((x) => x.action === "PRINT").actor_email,
    "admin@example.com",
  );
  const edit = history.find(
    (x) => x.action === "UPDATE" && x.before.truck_load !== x.after.truck_load,
  );
  assert.equal(edit.actor_email, "super_admin@example.com");
  assert.equal(edit.before.truck_load, 10000);
  assert.equal(edit.after.truck_load, 12000);
  assert.ok(history.every((x) => !JSON.stringify(x).includes("password")));
  const before = (await call("/audit-logs?invoice_id=" + third.id)).total;
  await call("/invoices/" + third.id + "/print", {
    role: "DATA_ENTRY",
    method: "POST",
    body: {},
    status: 403,
  });
  assert.equal(
    (await call("/audit-logs?invoice_id=" + third.id)).total,
    before,
  );
  await call("/invoices/" + third.id + "/print", {
    role: "ADMIN",
    method: "POST",
    body: {},
  });
  await call("/invoices/" + third.id + "/print", {
    role: "ADMIN",
    method: "POST",
    body: {},
  });
  assert.equal(
    (await call("/audit-logs?invoice_id=" + third.id + "&action=PRINT")).total,
    2,
  );
  const filtered = await call(
    "/audit-logs?email=data_entry%40example.com&action=CREATE",
  );
  assert.ok(filtered.data.length > 0);
  assert.ok(
    filtered.data.every(
      (x) =>
        x.actor_email === "data_entry@example.com" && x.action === "CREATE",
    ),
  );
  await call("/audit-logs?from=2026-11-20&to=2026-11-01", { status: 400 });
  await call("/audit-logs?invoice_id=abc", { status: 400 });
  await call("/audit-logs?action=DELETE", { status: 400 });
  await assert.rejects(
    db
      .prepare("UPDATE audit_logs SET actor_email=? WHERE id=?")
      .bind("fake@example.com", history[0].id)
      .run(),
    /append-only/,
  );
  await assert.rejects(
    db.prepare("DELETE FROM audit_logs WHERE id=?").bind(history[0].id).run(),
    /append-only/,
  );
  const actor = (
    await call("/users", {
      method: "POST",
      body: {
        email: "audit-actor@example.com",
        password: secret,
        role: "SUPER_ADMIN",
      },
    })
  ).data;
  const login = await call("/auth/login", {
    role: "none",
    method: "POST",
    body: { email: actor.email, password: secret },
  });
  cookies.ACTOR = login.cookie.split(";")[0];
  await call("/invoices/" + third.id + "/print", {
    role: "ACTOR",
    method: "POST",
    body: {},
  });
  await call("/users/" + actor.id, {
    method: "PUT",
    body: { email: "renamed-actor@example.com", role: "SUPER_ADMIN" },
  });
  await call("/users/" + actor.id, { method: "DELETE", body: {} });
  const retained = (await call("/audit-logs?email=audit-actor%40example.com"))
    .data;
  assert.equal(retained.length, 1);
  assert.equal(retained[0].actor_email, "audit-actor@example.com");
  const originalReceiver = (await call("/invoices/" + third.id)).data.receiver;
  await db
    .prepare(
      `CREATE TRIGGER fail_audit_test BEFORE INSERT ON audit_logs WHEN NEW.invoice_id=${third.id} BEGIN SELECT RAISE(ABORT,'test audit failure'); END`,
    )
    .run();
  await assert.rejects(
    db
      .prepare("UPDATE invoices SET receiver=? WHERE id=?")
      .bind("must roll back", third.id)
      .run(),
    /test audit failure/,
  );
  assert.equal(
    (await call("/invoices/" + third.id)).data.receiver,
    originalReceiver,
  );
  await db.prepare("DROP TRIGGER fail_audit_test").run();
  const page1 = await call("/audit-logs");
  assert.ok(page1.total > 20);
  assert.equal(page1.data.length, 20);
  const page2 = await call("/audit-logs?page=2");
  assert.ok(page2.data.length > 0);
  assert.ok(!page2.data.some((x) => page1.data.some((y) => x.id === y.id)));
});
