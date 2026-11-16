import { Router } from "express";
import { allow } from "../middleware/auth.js";
import {
  parse,
  invoiceInput,
  id,
  filters,
  fail,
  date as dateSchema,
} from "../validation/index.js";
import {
  serialize,
  departureValues,
  snapshots,
  invoiceColumns as cols,
} from "../services/invoices.js";
export function invoiceRoutes(db) {
  const r = Router();
  r.get("/", async (req, res) => {
    const v = parse(filters, req.query);
    if (
      req.user.role === "DATA_ENTRY" &&
      Object.keys(req.query).some((k) => k !== "page")
    )
      throw fail(403, "ليس لديك صلاحية تصفية الفواتير");
    const args = [
      v.customer_id || null,
      v.customer_id || null,
      v.driver_id || null,
      v.driver_id || null,
      v.from || null,
      v.from || null,
      v.to || null,
      v.to || null,
    ];
    const where =
      "WHERE (? IS NULL OR customer_id=?) AND (? IS NULL OR driver_id=?) AND (? IS NULL OR date>=?) AND (? IS NULL OR date<=?)";
    const rows = await db.batch([
      db
        .prepare(
          `SELECT * FROM invoices ${where} ORDER BY date DESC,id DESC LIMIT 20 OFFSET ?`,
        )
        .bind(...args, (v.page - 1) * 20),
      db
        .prepare(`SELECT COUNT(*) AS total FROM invoices ${where}`)
        .bind(...args),
    ]);
    res.json({
      data: rows[0].results.map(serialize),
      total: rows[1].results[0].total,
      page: v.page,
    });
  });
  r.get("/quantity", async (req, res) => {
    if (
      Object.keys(req.query).some(
        (k) => !["customer_id", "date", "exclude_id"].includes(k),
      )
    )
      throw fail(400, "البيانات غير صحيحة");
    const customer = parse(id, req.query.customer_id),
      date = parse(dateSchema, req.query.date),
      exclude = req.query.exclude_id ? parse(id, req.query.exclude_id) : null;
    let row;
    if (exclude) {
      const old = await db
        .prepare("SELECT created_at,id FROM invoices WHERE id=?")
        .bind(exclude)
        .first();
      if (!old) throw fail(404, "الفاتورة غير موجودة");
      row = await db
        .prepare(
          "SELECT COALESCE(SUM(truck_load),0) AS quantity FROM invoices WHERE customer_id=? AND date=? AND (created_at<? OR (created_at=? AND id<?))",
        )
        .bind(customer, date, old.created_at, old.created_at, exclude)
        .first();
    } else
      row = await db
        .prepare(
          "SELECT COALESCE(SUM(truck_load),0) AS quantity FROM invoices WHERE customer_id=? AND date=?",
        )
        .bind(customer, date)
        .first();
    res.json({ data: row.quantity / 1000 });
  });
  r.get("/:id", async (req, res) => {
    const row = await db
      .prepare("SELECT * FROM invoices WHERE id=?")
      .bind(parse(id, req.params.id))
      .first();
    if (!row) throw fail(404, "الفاتورة غير موجودة");
    res.json({ data: serialize(row) });
  });
  r.post("/", async (req, res) => {
    const v = parse(invoiceInput, req.body),
      names = await snapshots(db, v),
      all = { ...v, ...names, ...departureValues(v.departure) };
    const x = await db
      .prepare(
        `INSERT INTO invoices(${cols.join(",")},created_by,audit_actor_id,audit_actor_email) VALUES(${cols.map(() => "?").join(",")},?,?,?)`,
      )
      .bind(
        ...cols.map((k) => all[k]),
        req.user.id,
        req.user.id,
        req.user.email,
      )
      .run();
    const row = await db
      .prepare("SELECT * FROM invoices WHERE id=?")
      .bind(x.meta.last_row_id)
      .first();
    res.status(201).json({ data: serialize(row) });
  });
  r.put("/:id", allow("ADMIN", "SUPER_ADMIN"), async (req, res) => {
    const uid = parse(id, req.params.id),
      v = parse(invoiceInput, req.body);
    const old = await db
      .prepare("SELECT * FROM invoices WHERE id=?")
      .bind(uid)
      .first();
    if (!old) throw fail(404, "الفاتورة غير موجودة");
    if (old.printed_at && req.user.role !== "SUPER_ADMIN")
      throw fail(403, "لا يمكن تعديل الفاتورة بعد طباعتها");
    const all = {
      ...v,
      ...(await snapshots(db, v, old)),
      ...departureValues(v.departure, old),
    };
    const x = await db
      .prepare(
        `UPDATE invoices SET ${cols.map((k) => `${k}=?`).join(",")},audit_actor_id=?,audit_actor_email=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND (printed_at IS NULL OR ?='SUPER_ADMIN')`,
      )
      .bind(
        ...cols.map((k) => all[k]),
        req.user.id,
        req.user.email,
        uid,
        req.user.role,
      )
      .run();
    if (!x.meta.changes) throw fail(403, "لا يمكن تعديل الفاتورة بعد طباعتها");
    res.json({
      data: serialize(
        await db.prepare("SELECT * FROM invoices WHERE id=?").bind(uid).first(),
      ),
    });
  });
  r.post("/:id/print", allow("ADMIN", "SUPER_ADMIN"), async (req, res) => {
    if (req.body && Object.keys(req.body).length)
      throw fail(400, "البيانات غير صحيحة");
    const uid = parse(id, req.params.id);
    const x = await db
      .prepare(
        "UPDATE invoices SET audit_actor_id=?,audit_actor_email=?,printed_at=COALESCE(printed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id=?",
      )
      .bind(req.user.id, req.user.email, uid)
      .run();
    if (!x.meta.changes) throw fail(404, "الفاتورة غير موجودة");
    res.json({
      data: serialize(
        await db.prepare("SELECT * FROM invoices WHERE id=?").bind(uid).first(),
      ),
    });
  });
  return r;
}
