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
  if (
    method === "PUT" &&
    /^\/invoices\/\d+$/.test(path) &&
    body?.version === undefined
  ) {
    const current = await fetch(base + "/api" + path, {
      headers: { Cookie: cookies[role] || "" },
    });
    const row = await current.json();
    body = { ...body, version: row.data?.version || 1 };
  }
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(method === "POST" && path === "/invoices"
        ? { "Idempotency-Key": crypto.randomUUID() }
        : {}),
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
      /^\/(customers|drivers|mix-types|vehicles|pumps|mixers|users|invoices)$/.test(
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
  await call("/invoices", {
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
test("factory arrival is optional, validated, editable, and included in audit snapshots", async () => {
  const body = invoice({ date: "2026-12-02", factory_arrival: "17:20" });
  const row = (await call("/invoices", { method: "POST", body })).data;
  assert.equal(row.factory_arrival, "17:20");
  assert.equal(
    (await call("/invoices/" + row.id)).data.factory_arrival,
    "17:20",
  );
  const edited = (
    await call("/invoices/" + row.id, {
      role: "ADMIN",
      method: "PUT",
      body: { ...body, factory_arrival: "17:35" },
    })
  ).data;
  assert.equal(edited.factory_arrival, "17:35");
  const logs = (await call("/audit-logs?invoice_id=" + row.id)).data;
  assert.equal(logs[0].before.factory_arrival, "17:20");
  assert.equal(logs[0].after.factory_arrival, "17:35");
  await call("/invoices/" + row.id, {
    role: "DATA_ENTRY",
    method: "PUT",
    body,
    status: 403,
  });
  for (const value of ["24:00", "12:60", "8:05", "17:05:10", 42])
    await call("/invoices", {
      method: "POST",
      body: { ...body, factory_arrival: value },
      status: 400,
    });
  const optional = (
    await call("/invoices", {
      method: "POST",
      body: invoice({ date: "2026-12-03" }),
    })
  ).data;
  assert.equal(optional.factory_arrival, "");
  const nullable = (
    await call("/invoices", {
      method: "POST",
      body: { ...body, factory_arrival: null },
    })
  ).data;
  assert.equal(nullable.factory_arrival, "");
  await db
    .prepare("UPDATE invoices SET factory_arrival=NULL WHERE id=?")
    .bind(optional.id)
    .run();
  assert.equal(
    (await call("/invoices/" + optional.id)).data.factory_arrival,
    null,
  );
});
test("mixer choices validate, retain invoice snapshots and appear in audit logs", async () => {
  await call("/mixers", {
    role: "DATA_ENTRY",
    method: "POST",
    body: { name: "MX-01" },
    status: 403,
  });
  const mixer = (
    await call("/mixers", {
      role: "ADMIN",
      method: "POST",
      body: { name: "MX-01" },
    })
  ).data;
  assert.equal((await call("/mixers?search=MX-01")).data[0].id, mixer.id);
  const body = invoice({ date: "2026-12-04", mixer_id: mixer.id });
  const row = (await call("/invoices", { method: "POST", body })).data;
  assert.equal(row.mixer_name, "MX-01");
  await call("/mixers/" + mixer.id, {
    method: "PUT",
    body: { name: "MX-renamed" },
  });
  await call("/mixers/" + mixer.id, { method: "DELETE", body: {} });
  const edited = (
    await call("/invoices/" + row.id, {
      method: "PUT",
      body: { ...body, receiver: "مستلم جديد" },
    })
  ).data;
  assert.equal(edited.mixer_name, "MX-01");
  const logs = (await call("/audit-logs?invoice_id=" + row.id)).data;
  assert.equal(logs[0].after.mixer_name, "MX-01");
  await call("/invoices", { method: "POST", body, status: 400 });
  await call("/invoices", {
    method: "POST",
    body: { ...body, mixer_id: -1 },
    status: 400,
  });
  const cleared = (
    await call("/invoices/" + row.id, {
      method: "PUT",
      body: { ...body, mixer_id: null },
    })
  ).data;
  assert.equal(cleared.mixer_id, null);
  assert.equal(cleared.mixer_name, "");
});
test("parallel invoice writes maintain correct integer totals", async () => {
  await Promise.all(
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
        role: "ADMIN",
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
    body: { email: "renamed-actor@example.com", role: "ADMIN" },
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

test("Super Admin accounts are self-managed and protected from other accounts", async () => {
  const target = (
    await call("/users", {
      method: "POST",
      body: {
        email: "protected-super@example.com",
        password: secret,
        role: "SUPER_ADMIN",
      },
    })
  ).data;
  const session = await call("/auth/login", {
    role: "none",
    method: "POST",
    body: { email: target.email, password: secret },
  });
  cookies.PROTECTED = session.cookie.split(";")[0];
  await call("/users/" + target.id, {
    method: "DELETE",
    body: {},
    status: 403,
  });
  for (const role of ["ADMIN", "DATA_ENTRY"])
    await call("/users/" + target.id, {
      method: "PUT",
      body: { email: target.email, role },
      status: 403,
    });
  assert.equal(
    (await call("/auth/me", { role: "PROTECTED" })).data.role,
    "SUPER_ADMIN",
    "Rejected changes must not revoke the target session",
  );
  const retained = (await call("/users")).data.find(
    (user) => user.id === target.id,
  );
  assert.equal(retained.role, "SUPER_ADMIN");
  assert.equal(retained.email, target.email);
  for (const email of [target.email, "forbidden-edit@example.com"])
    await call("/users/" + target.id, {
      method: "PUT",
      body: { email, role: "SUPER_ADMIN" },
      status: 403,
    });
  await call("/users/" + target.id + "/password", {
    method: "POST",
    body: { password: "Forbidden-reset-password-2026" },
    status: 403,
  });
  assert.equal(
    (await call("/auth/me", { role: "PROTECTED" })).data.email,
    target.email,
    "Denied requests must preserve the target session and account",
  );
  const untouched = await db
    .prepare("SELECT password_hash FROM users WHERE id=?")
    .bind(target.id)
    .first();
  assert.equal(await verifyPassword(secret, untouched.password_hash), true);
  const caller = (await call("/auth/me")).data;
  await call("/users/" + caller.id, {
    role: "PROTECTED",
    method: "PUT",
    body: { email: "forbidden-caller@example.com", role: "SUPER_ADMIN" },
    status: 403,
  });
  await call("/users/" + caller.id + "/password", {
    role: "PROTECTED",
    method: "POST",
    body: { password: "Forbidden-reset-password-2026" },
    status: 403,
  });
  assert.equal((await call("/auth/me")).data.email, caller.email);
  await call("/users/" + target.id, {
    role: "PROTECTED",
    method: "PUT",
    body: { email: "protected-renamed@example.com", role: "SUPER_ADMIN" },
  });
  await call("/users/" + target.id + "/password", {
    role: "PROTECTED",
    method: "POST",
    body: { password: "New-protected-password-2026" },
  });
  await call("/auth/me", { role: "PROTECTED", status: 401 });
  await call("/auth/login", {
    role: "none",
    method: "POST",
    body: {
      email: "protected-renamed@example.com",
      password: "New-protected-password-2026",
    },
  });
  const promoted = (
    await call("/users", {
      method: "POST",
      body: {
        email: "promoted-super@example.com",
        password: secret,
        role: "ADMIN",
      },
    })
  ).data;
  const oldSession = await call("/auth/login", {
    role: "none",
    method: "POST",
    body: { email: promoted.email, password: secret },
  });
  cookies.PROMOTED = oldSession.cookie.split(";")[0];
  await call("/users/" + promoted.id, {
    method: "PUT",
    body: { email: promoted.email, role: "SUPER_ADMIN" },
  });
  await call("/auth/me", { role: "PROMOTED", status: 401 });
  await call("/users/" + promoted.id, {
    method: "DELETE",
    body: {},
    status: 403,
  });
  await call("/users/" + promoted.id, {
    method: "PUT",
    body: { email: promoted.email, role: "DATA_ENTRY" },
    status: 403,
  });
  await call("/users/2147483647", { method: "DELETE", body: {}, status: 404 });
});

test("idempotency serializes simultaneous submissions, replays and rejects changed payloads", async () => {
  const headers = { "Idempotency-Key": crypto.randomUUID() },
    body = invoice({ date: "2026-12-10" });
  // Current driver fixture was soft-deleted in earlier regression checks: create a fresh one.
  body.driver_id = (
    await call("/drivers", {
      method: "POST",
      body: { name: "Integrity driver" },
    })
  ).data.id;
  const responses = await Promise.all(
    Array.from({ length: 6 }, () =>
      call("/invoices", { method: "POST", body, headers }),
    ),
  );
  assert.equal(new Set(responses.map((r) => r.data.id)).size, 1);
  const row = responses[0].data;
  const actual = await db
    .prepare("SELECT COUNT(*) AS n FROM invoices WHERE idempotency_key=?")
    .bind(headers["Idempotency-Key"])
    .first();
  assert.equal(actual.n, 1);
  const audit = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM audit_logs WHERE invoice_id=? AND action='CREATE'",
    )
    .bind(row.id)
    .first();
  assert.equal(audit.n, 1);
  const replay = await call("/invoices", { method: "POST", body, headers });
  assert.deepEqual(replay.data, row);
  await call("/invoices", {
    method: "POST",
    body: { ...body, truck_load: "11" },
    headers,
    status: 409,
  });
  const separate = await call("/invoices", { method: "POST", body });
  assert.notEqual(separate.data.id, row.id);
  assert.equal(replay.data.idempotency_key, undefined);
  assert.equal(replay.data.request_hash, undefined);
  await call("/invoices/" + row.id, {
    method: "PUT",
    body: { ...body, receiver: "Later edited recipient" },
  });
  const historicalReplay = await call("/invoices", {
    method: "POST",
    body,
    headers,
  });
  assert.deepEqual(historicalReplay.data, replay.data);
});
test("optimistic versions reject concurrent edits and printing invalidates stale versions", async () => {
  const driver = (
    await call("/drivers", { method: "POST", body: { name: "Version driver" } })
  ).data;
  const body = invoice({ driver_id: driver.id, date: "2026-12-11" });
  const row = (await call("/invoices", { method: "POST", body })).data;
  const send = (receiver) =>
    fetch(base + "/api/invoices/" + row.id, {
      method: "PUT",
      headers: {
        Cookie: cookies.SUPER_ADMIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, receiver, version: row.version }),
    });
  const results = await Promise.all([send("one"), send("two")]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const current = (await call("/invoices/" + row.id)).data;
  await call("/invoices/" + row.id + "/print", { method: "POST", body: {} });
  await call("/invoices/" + row.id, {
    method: "PUT",
    body: { ...body, version: current.version },
    status: 409,
  });
  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM invoices WHERE id=?")
    .bind(row.id)
    .first();
  assert.equal(count.n, 1);
});
test("legacy password login upgrades without revoking valid sessions; failures do not upgrade", async () => {
  const old = await hashPassword(secret, undefined, 100000);
  await db
    .prepare("INSERT INTO users(email,password_hash,role) VALUES(?,?,'ADMIN')")
    .bind("legacy@example.com", old)
    .run();
  await call("/auth/login", {
    role: "none",
    method: "POST",
    body: { email: "legacy@example.com", password: "incorrect" },
    status: 401,
  });
  assert.equal(
    (
      await db
        .prepare("SELECT password_hash FROM users WHERE email=?")
        .bind("legacy@example.com")
        .first()
    ).password_hash,
    old,
  );
  const login = await call("/auth/login", {
    role: "none",
    method: "POST",
    body: { email: "legacy@example.com", password: secret },
  });
  cookies.LEGACY = login.cookie.split(";")[0];
  assert.equal((await call("/auth/me", { role: "LEGACY" })).data.role, "ADMIN");
  const upgraded = (
    await db
      .prepare("SELECT password_hash FROM users WHERE email=?")
      .bind("legacy@example.com")
      .first()
  ).password_hash;
  assert.match(upgraded, /^pbkdf2\$600000\$/);
  assert.equal(await verifyPassword(secret, upgraded), true);
  assert.equal(await verifyPassword(secret, "pbkdf2$999999999$bad$bad"), false);
});
test("security headers and cache policy cover API, HTML, static assets and HTTPS", async () => {
  const { protectResponse } = await import("../server/security.js");
  const response = await fetch(base + "/api/auth/me");
  assert.equal(response.status, 401);
  for (const name of [
    "content-security-policy",
    "permissions-policy",
    "x-content-type-options",
    "referrer-policy",
  ])
    assert.ok(response.headers.get(name));
  assert.equal(response.headers.get("cache-control"), "no-store");
  for (const path of [
    "/",
    "/invoices/1",
    "/assets/index-abcdefgh.js",
    "/api/invoices",
  ]) {
    const r = protectResponse(
      new Response("test"),
      new Request("https://example.test" + path),
    );
    assert.match(
      r.headers.get("content-security-policy"),
      /frame-ancestors 'none'/,
    );
    assert.match(r.headers.get("strict-transport-security"), /31536000/);
    assert.equal(
      r.headers.get("cache-control"),
      path.startsWith("/api/")
        ? "no-store"
        : path.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
    );
  }
});
test("cursor pages have no repeated rows, skip repeat counts and bound selectors", async () => {
  const first = await call("/invoices");
  assert.ok(first.data.length <= 20);
  assert.ok(first.next_cursor);
  const next = await call(
    "/invoices?count=0&page=2&cursor=" + first.next_cursor,
  );
  assert.equal(next.total, undefined);
  assert.equal(
    next.data.some((x) => first.data.some((y) => y.id === x.id)),
    false,
  );
  await call("/invoices?cursor=invalid", { status: 400 });
  await call("/invoices?page=101", { status: 400 });
  const masters = await call("/customers?limit=1");
  assert.equal(masters.data.length, 1);
  const more = await call("/customers?limit=1&cursor=" + masters.next_cursor);
  assert.notEqual(more.data[0]?.id, masters.data[0].id);
  await call("/customers?limit=101", { status: 400 });
  await call("/customers?include_deleted=1", {
    role: "DATA_ENTRY",
    status: 403,
  });
  await call("/invoices?customer_id=1", { role: "DATA_ENTRY", status: 403 });
});
test("literal HTML-like input stays ordinary text and mass assignment is rejected", async () => {
  const name = "<img src=x onerror=alert(1)> & شركة";
  const row = (await call("/customers", { method: "POST", body: { name } }))
    .data;
  assert.equal(row.name, name);
  await call("/customers", {
    method: "POST",
    body: { name: "bad", role: "SUPER_ADMIN" },
    status: 400,
  });
  await call("/invoices", {
    method: "POST",
    body: { ...invoice(), previous: 999 },
    status: 400,
  });
  assert.deepEqual(
    (await db.prepare("PRAGMA foreign_key_check").all()).results,
    [],
  );
});
test("login limiter ignores spoofed forwarding headers locally and returns generic errors", async () => {
  for (let n = 0; n < 11; n++)
    await call("/auth/login", {
      role: "none",
      method: "POST",
      body: { email: "nonexistent-limiter@example.com", password: "incorrect" },
      headers: {
        "CF-Connecting-IP": "203.0.113." + n,
        "X-Forwarded-For": "198.51.100." + n,
      },
      status: n < 10 ? 401 : 429,
    });
});

test("all restricted route families reject unauthenticated and unauthorized roles", async () => {
  for (const path of [
    "/users",
    "/audit-logs",
    "/invoices",
    "/invoices/1",
    "/invoices/quantity?customer_id=1&date=2026-01-01",
    "/customers",
    "/drivers",
    "/mix-types",
    "/vehicles",
    "/pumps",
    "/mixers",
  ])
    await call(path, { role: "none", status: 401 });
  for (const master of [
    "customers",
    "drivers",
    "mix-types",
    "vehicles",
    "pumps",
    "mixers",
  ])
    for (const method of ["POST", "PUT", "DELETE"])
      await call("/" + master + (method === "POST" ? "" : "/1"), {
        role: "DATA_ENTRY",
        method,
        body: { name: "denied" },
        status: 403,
      });
  for (const role of ["DATA_ENTRY", "ADMIN"]) {
    await call("/users", { role, status: 403 });
    await call("/audit-logs", { role, status: 403 });
    await call("/users", { role, method: "POST", body: {}, status: 403 });
    await call("/users/1", { role, method: "PUT", body: {}, status: 403 });
    await call("/users/1/password", {
      role,
      method: "POST",
      body: {},
      status: 403,
    });
    await call("/users/1", { role, method: "DELETE", body: {}, status: 403 });
  }
  await call("/invoices/1", {
    role: "DATA_ENTRY",
    method: "PUT",
    body: {},
    status: 403,
  });
  await call("/invoices/1/print", {
    role: "DATA_ENTRY",
    method: "POST",
    body: {},
    status: 403,
  });
});

test("PBKDF2 implementation matches native reference vectors for both supported costs", async () => {
  const { pbkdf2Sync } = await import("node:crypto");
  const salt = "1234567890abcdef1234567890abcdef";
  for (const iterations of [100000, 600000]) {
    const actual = await hashPassword("reference-password", salt, iterations);
    const expected = pbkdf2Sync(
      "reference-password",
      Buffer.from(salt, "hex"),
      iterations,
      32,
      "sha256",
    ).toString("hex");
    assert.equal(actual.split("$")[3], expected);
  }
});

test("delta quantity triggers match a reference model for out-of-order inserts and group moves", async () => {
  const customerIds = [];
  for (let i = 0; i < 2; i++)
    customerIds.push(
      (
        await call("/customers", {
          method: "POST",
          body: { name: "Quantity model " + i },
        })
      ).data.id,
    );
  const driver = (
    await call("/drivers", {
      method: "POST",
      body: { name: "Quantity model driver" },
    })
  ).data.id;
  let seed = 451;
  const random = (n) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % n;
  };
  const model = [];
  const verify = async () => {
    const rows = (
      await db
        .prepare(
          "SELECT id,customer_id,date,truck_load,created_at,previous,cumulative FROM invoices WHERE customer_id IN (?,?) ORDER BY customer_id,date,created_at,id",
        )
        .bind(...customerIds)
        .all()
    ).results;
    const totals = new Map();
    for (const row of rows) {
      const expected = model.find((x) => x.id === row.id);
      assert.equal(row.truck_load, expected.truck_load);
      const key = row.customer_id + ":" + row.date;
      const previous = totals.get(key) || 0;
      assert.equal(row.previous, previous);
      assert.equal(row.cumulative, previous + row.truck_load);
      totals.set(key, row.cumulative);
    }
  };
  for (let i = 0; i < 24; i++) {
    const value = {
      customer_id: customerIds[random(2)],
      date: "2027-01-0" + (1 + random(3)),
      truck_load: random(2001),
      created_at:
        "2026-01-01T10:" + String(random(60)).padStart(2, "0") + ":00.000Z",
    };
    const r = await db
      .prepare(
        "INSERT INTO invoices(customer_id,driver_id,mix_type_id,vehicle_id,pump_id,customer_name,driver_name,mix_type_name,vehicle_name,pump_name,date,pour_location,requested,truck_load,departure,arrival,finish,receiver,created_at) VALUES(?,?,?,?,?,'Model','Model','Model','Model','Model',?,'Model',100000,?,'10:00','','','',?)",
      )
      .bind(
        value.customer_id,
        driver,
        refs.mix_type_id,
        refs.vehicle_id,
        refs.pump_id,
        value.date,
        value.truck_load,
        value.created_at,
      )
      .run();
    model.push({ ...value, id: r.meta.last_row_id });
    await verify();
  }
  for (let i = 0; i < 40; i++) {
    const value = model[random(model.length)];
    Object.assign(value, {
      customer_id: customerIds[random(2)],
      date: "2027-01-0" + (1 + random(3)),
      truck_load: random(2001),
    });
    await db
      .prepare(
        "UPDATE invoices SET customer_id=?,date=?,truck_load=? WHERE id=?",
      )
      .bind(value.customer_id, value.date, value.truck_load, value.id)
      .run();
    await verify();
  }
});

test("internal error logging contains no exception detail, SQL, body, cookie or token", async () => {
  const marker = "SYNTHETIC_PRIVATE_MARKER",
    logs = [],
    original = console.log;
  const isolated = createApp({
    prepare() {
      throw new Error("D1_ERROR SQL " + marker);
    },
  }).listen(0, "127.0.0.1");
  await new Promise((r) => isolated.once("listening", r));
  console.log = (...args) => logs.push(args.join(" "));
  try {
    const r = await fetch(
      "http://127.0.0.1:" + isolated.address().port + "/api/invoices",
      { headers: { Cookie: "anbar_session=" + marker } },
    );
    assert.equal(r.status, 500);
    assert.equal((await r.text()).includes(marker), false);
    await new Promise((r) => setImmediate(r));
    assert.ok(logs.length);
    assert.equal(logs.join(" ").includes(marker), false);
    for (const line of logs)
      assert.deepEqual(Object.keys(JSON.parse(line)).sort(), [
        "event",
        "request_id",
        "status",
      ]);
  } finally {
    console.log = original;
    await new Promise((r) => isolated.close(r));
  }
});
