import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createApp } from "../server/app.js";
import { digest } from "../server/services/crypto.js";
// Synthetic local D1 benchmark. No Cloudflare credentials or production DB access.
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
async function migrate(db, file) {
  const sql = await readFile("migrations/" + file, "utf8"),
    [tables, ...triggers] = sql.split("CREATE TRIGGER");
  for (const part of tables
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean))
    await db.prepare(part).run();
  for (const part of triggers) await db.prepare("CREATE TRIGGER" + part).run();
}
const quantile = (x, q) =>
  [...x].sort((a, b) => a - b)[
    Math.min(x.length - 1, Math.ceil(x.length * q) - 1)
  ];
if (!existsSync("tmp/optimization/rollback-worker/server/app.js")) {
  const built = spawnSync(
    process.execPath,
    ["scripts/build-rollback-worker.js"],
    { stdio: "pipe" },
  );
  if (built.status !== 0) throw Error("Prepare benchmark baseline failed");
}
const { createApp: baselineApp } = await import(
  pathToFileURL(resolve("tmp/optimization/rollback-worker/server/app.js"))
);
const results = [];
for (const size of [10000, 100000]) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "benchmark",
          modules: true,
          script: 'export default {fetch(){return new Response("synthetic")}}',
          compatibilityDate: "2026-11-16",
          d1Databases: ["DB"],
        },
      ],
    }),
  );
  try {
    const db = await mf.getD1Database("DB");
    const files = (await readdir("migrations"))
      .filter((x) => x.endsWith(".sql"))
      .sort();
    for (const f of files.filter((x) => x < "0006")) await migrate(db, f);
    const triggers = (
      await db
        .prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'")
        .all()
    ).results;
    for (const t of triggers) await db.prepare(`DROP TRIGGER ${t.name}`).run();
    for (const table of [
      "customers",
      "drivers",
      "mix_types",
      "vehicles",
      "pumps",
    ]) {
      for (let i = 1; i <= 20; i++)
        await db
          .prepare(`INSERT INTO ${table}(name) VALUES(?)`)
          .bind("Synthetic " + i)
          .run();
    }
    await db
      .prepare(
        `WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<${size}) INSERT INTO invoices(customer_id,driver_id,mix_type_id,vehicle_id,pump_id,customer_name,driver_name,mix_type_name,vehicle_name,pump_name,date,pour_location,requested,truck_load,departure,arrival,finish,receiver) SELECT 1+(CAST(x/100 AS INTEGER)%10),1+(CAST(x/1000 AS INTEGER)%20),1,1,1,'Synthetic customer','Synthetic driver','Synthetic mix','Synthetic vehicle','Synthetic pump',date('2026-01-01','+'||(x%100)||' days'),'Synthetic site',1000000,1000,'10:00','','','' FROM n`,
      )
      .run();
    await db
      .prepare(
        "INSERT INTO audit_logs(invoice_id,actor_email,action,after_data) SELECT id,'synthetic@example.invalid','CREATE','{}' FROM invoices",
      )
      .run();
    await db
      .prepare(
        "CREATE TABLE bench_totals AS SELECT id,COALESCE(SUM(truck_load) OVER(PARTITION BY customer_id,date ORDER BY created_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS previous,SUM(truck_load) OVER(PARTITION BY customer_id,date ORDER BY created_at,id ROWS UNBOUNDED PRECEDING) AS cumulative FROM invoices",
      )
      .run();
    await db
      .prepare("CREATE UNIQUE INDEX bench_totals_id ON bench_totals(id)")
      .run();
    await db
      .prepare(
        "UPDATE invoices SET previous=(SELECT previous FROM bench_totals WHERE bench_totals.id=invoices.id),cumulative=(SELECT cumulative FROM bench_totals WHERE bench_totals.id=invoices.id)",
      )
      .run();
    await db.prepare("DROP TABLE bench_totals").run();
    for (const t of triggers) await db.prepare(t.sql).run();
    const session = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO users(email,password_hash,role) VALUES('benchmark@example.invalid','not-a-login-hash','SUPER_ADMIN')",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,1,?)",
      )
      .bind(await digest(session), Date.now() + 3600000)
      .run();
    const position = await db
      .prepare(
        "SELECT date,id FROM invoices ORDER BY date DESC,id DESC LIMIT 1 OFFSET ?",
      )
      .bind(Math.floor(size * 0.9) - 1)
      .first();
    for (const phase of ["before", "after"]) {
      if (phase === "after")
        for (const f of files.filter((x) => x >= "0006")) await migrate(db, f);
      const base =
        "WHERE (? IS NULL OR customer_id=?) AND (? IS NULL OR driver_id=?) AND (? IS NULL OR date>=?) AND (? IS NULL OR date<=?)";
      const old = (args) => ({
        sql: `SELECT * FROM invoices ${base} ORDER BY date DESC,id DESC LIMIT 20`,
        args,
        count: { sql: `SELECT COUNT(*) AS total FROM invoices ${base}`, args },
      });
      const listColumns =
        "id,date,customer_name,driver_name,mix_type_name,truck_load,requested,previous,cumulative,printed_at,version";
      const filtered = (where, args) => ({
        sql: `SELECT ${listColumns} FROM invoices${where.includes("customer_id=? AND driver_id=?") ? " INDEXED BY invoice_customer_driver_order" : ""} ${where} ORDER BY date DESC,id DESC LIMIT 21`,
        args,
      });
      const queries = {
        invoice_list:
          phase === "before" ? old(Array(8).fill(null)) : filtered("", []),
        customer_date:
          phase === "before"
            ? old([
                1,
                1,
                null,
                null,
                "2026-01-01",
                "2026-01-01",
                "2026-03-01",
                "2026-03-01",
              ])
            : filtered("WHERE customer_id=? AND date>=? AND date<=?", [
                1,
                "2026-01-01",
                "2026-03-01",
              ]),
        driver:
          phase === "before"
            ? old([null, null, 1, 1, null, null, null, null])
            : filtered("WHERE driver_id=?", [1]),
        combined:
          phase === "before"
            ? old([
                1,
                1,
                1,
                1,
                "2026-01-01",
                "2026-01-01",
                "2026-03-01",
                "2026-03-01",
              ])
            : filtered(
                "WHERE customer_id=? AND driver_id=? AND date>=? AND date<=?",
                [1, 1, "2026-01-01", "2026-03-01"],
              ),
        date_range:
          phase === "before"
            ? old([
                null,
                null,
                null,
                null,
                "2026-02-01",
                "2026-02-01",
                "2026-02-15",
                "2026-02-15",
              ])
            : filtered("WHERE date>=? AND date<=?", [
                "2026-02-01",
                "2026-02-15",
              ]),
        deep_page:
          phase === "before"
            ? {
                sql: "SELECT * FROM invoices ORDER BY date DESC,id DESC LIMIT 20 OFFSET ?",
                args: [Math.floor(size * 0.9)],
              }
            : filtered("WHERE (date,id)<(?,?)", [position.date, position.id]),
        detail: {
          sql: "SELECT * FROM invoices WHERE id=?",
          args: [Math.floor(size / 2)],
        },
        number_lookup: {
          sql: "SELECT * FROM invoices WHERE id=?",
          args: [Math.floor(size / 2)],
        },
        quantity: {
          sql:
            phase === "before"
              ? "SELECT SUM(truck_load) AS quantity FROM invoices WHERE customer_id=? AND date=?"
              : "SELECT cumulative AS quantity FROM invoices WHERE customer_id=? AND date=? ORDER BY created_at DESC,id DESC LIMIT 1",
          args: [1, "2026-01-01"],
        },
        audit:
          phase === "before"
            ? {
                sql: "SELECT * FROM audit_logs WHERE (? IS NULL OR invoice_id=?) ORDER BY id DESC LIMIT 20",
                args: [Math.floor(size / 2), Math.floor(size / 2)],
              }
            : {
                sql: "SELECT * FROM audit_logs WHERE invoice_id=? ORDER BY id DESC LIMIT 21",
                args: [Math.floor(size / 2)],
              },
        create: {
          sql: "INSERT INTO invoices(customer_id,driver_id,mix_type_id,vehicle_id,pump_id,customer_name,driver_name,mix_type_name,vehicle_name,pump_name,date,pour_location,requested,truck_load,departure,arrival,finish,receiver) VALUES(1,1,1,1,1,'Synthetic','Synthetic','Synthetic','Synthetic','Synthetic','2026-01-01','Synthetic',1000000,1000,'10:00','','','')",
          args: [],
        },
      };
      for (const [name, q] of Object.entries(queries)) {
        const plan = (
          await db
            .prepare("EXPLAIN QUERY PLAN " + q.sql)
            .bind(...q.args)
            .all()
        ).results.map((x) => x.detail);
        const samples = [],
          reads = [],
          writes = [],
          durations = [];
        for (let i = 0; i < 25; i++) {
          const start = performance.now(),
            statements = [db.prepare(q.sql).bind(...q.args)];
          if (q.count)
            statements.push(db.prepare(q.count.sql).bind(...q.count.args));
          const r = await db.batch(statements);
          samples.push(performance.now() - start);
          reads.push(r.reduce((n, x) => n + (x.meta.rows_read || 0), 0));
          writes.push(r.reduce((n, x) => n + (x.meta.rows_written || 0), 0));
          durations.push(r.reduce((n, x) => n + (x.meta.duration || 0), 0));
        }
        results.push({
          size,
          phase,
          query: name,
          samples: 25,
          p50_ms: +quantile(samples, 0.5).toFixed(2),
          p95_ms: +quantile(samples, 0.95).toFixed(2),
          p50_sql_ms: quantile(durations, 0.5),
          rows_read_p50: quantile(reads, 0.5),
          rows_written_p50: quantile(writes, 0.5),
          plan,
        });
      }
      const server = (phase === "before" ? baselineApp : createApp)(db).listen(
        0,
        "127.0.0.1",
      );
      await new Promise((r) => server.once("listening", r));
      try {
        const paths = {
          invoice_list: "/invoices?count=0",
          customer_date:
            "/invoices?customer_id=1&from=2026-01-01&to=2026-03-01&count=0",
          driver: "/invoices?driver_id=1&count=0",
          combined:
            "/invoices?customer_id=1&driver_id=1&from=2026-01-01&to=2026-03-01&count=0",
          detail: "/invoices/" + Math.floor(size / 2),
          quantity: "/invoices/quantity?customer_id=1&date=2026-01-01",
          audit: "/audit-logs?invoice_id=" + Math.floor(size / 2) + "&count=0",
          create: "/invoices",
        };
        for (const [name, path] of Object.entries(paths)) {
          const samples = [];
          for (let i = 0; i < 25; i++) {
            let endpoint = path;
            if (phase === "before")
              endpoint = endpoint
                .replace(/([?&])count=0&?/g, "$1")
                .replace(/[?&]$/, "");
            const start = performance.now();
            const response = await fetch(
              "http://127.0.0.1:" + server.address().port + "/api" + endpoint,
              {
                method: name === "create" ? "POST" : "GET",
                headers: {
                  Cookie: "anbar_session=" + session,
                  "Content-Type": "application/json",
                  "Idempotency-Key": crypto.randomUUID(),
                },
                body:
                  name === "create"
                    ? JSON.stringify({
                        customer_id: 1,
                        driver_id: 1,
                        mix_type_id: 1,
                        vehicle_id: 1,
                        pump_id: 1,
                        date: "2026-01-01",
                        pour_location: "Synthetic site",
                        requested: "1000",
                        truck_load: "1",
                        departure: "10:00",
                      })
                    : undefined,
              },
            );
            await response.arrayBuffer();
            if (!response.ok)
              throw Error(
                "Synthetic API benchmark failed: " +
                  name +
                  " " +
                  response.status,
              );
            samples.push(performance.now() - start);
          }
          results.push({
            size,
            phase,
            query: name,
            measurement:
              "local HTTP Express + real local D1, including auth and creation safeguards",
            samples: 25,
            p50_ms: +quantile(samples, 0.5).toFixed(2),
            p95_ms: +quantile(samples, 0.95).toFixed(2),
            rows_read:
              "See corresponding SQL/trigger measurement; no aggregate D1 meta exposed by API",
          });
        }
      } finally {
        await new Promise((r) => server.close(r));
      }
      // Remove only this isolated benchmark's write probes so before/after reads use the same dataset.
      const guard = triggers.find((t) => t.name === "audit_no_delete");
      await db.prepare("DROP TRIGGER audit_no_delete").run();
      await db
        .prepare("DELETE FROM audit_logs WHERE invoice_id>?")
        .bind(size)
        .run();
      await db.prepare("DELETE FROM invoices WHERE id>?").bind(size).run();
      await db.prepare(guard.sql).run();
      // Count is still exact on initial page; later pages omit it. Measure separately.
      if (phase === "after") {
        const t = performance.now(),
          r = await db.prepare("SELECT COUNT(*) AS total FROM invoices").all();
        results.push({
          size,
          phase,
          query: "initial_exact_count",
          elapsed_ms: performance.now() - t,
          rows_read: r.meta.rows_read,
          plan: (
            await db
              .prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM invoices")
              .all()
          ).results.map((x) => x.detail),
        });
      }
    }
  } finally {
    await mf.dispose();
  }
  console.log("Completed synthetic local D1 dataset: " + size);
}
await mkdir("tmp/optimization", { recursive: true });
await writeFile(
  "tmp/optimization/performance.json",
  JSON.stringify(
    {
      environment:
        "Local D1 SQL metrics plus local HTTP Express/auth measurements; no hosted network/Worker CPU capacity guarantee",
      datasets: [10000, 100000],
      results,
    },
    null,
    2,
  ),
);
console.log("Saved tmp/optimization/performance.json");
