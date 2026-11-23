import {
  encodeCursor,
  decodeCursor,
  predicate,
} from "../services/pagination.js";
import { Router } from "express";
import { digest } from "../services/crypto.js";
import { allow } from "../middleware/auth.js";
import {
  parse,
  invoiceInput,
  invoiceEdit,
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
      Object.keys(req.query).some(
        (k) => !["page", "cursor", "count"].includes(k),
      )
    )
      throw fail(403, "ليس لديك صلاحية تصفية الفواتير");
    const parts = [],
      args = [];
    predicate(parts, args, "customer_id=?", v.customer_id);
    predicate(parts, args, "driver_id=?", v.driver_id);
    predicate(parts, args, "date>=?", v.from);
    predicate(parts, args, "date<=?", v.to);
    if (v.number) predicate(parts, args, "id=?", Number(v.number.slice(4)));
    const index =
      v.customer_id && v.driver_id
        ? " INDEXED BY invoice_customer_driver_order"
        : "";
    const baseWhere = parts.length ? "WHERE " + parts.join(" AND ") : "";
    const position = decodeCursor(v.cursor, "invoice");
    const rowArgs = [...args];
    let where = baseWhere;
    if (position) {
      where += (where ? " AND " : "WHERE ") + "(date,id)<(?,?)";
      rowArgs.push(position.date, position.id);
    }
    if (!position && v.page > 100)
      throw fail(400, "يرجى التنقل باستخدام التالي والسابق");
    const offset = position ? 0 : (v.page - 1) * 20;
    const statements = [
      db
        .prepare(
          `SELECT id,date,customer_name,driver_name,mix_type_name,truck_load,requested,previous,cumulative,printed_at,version FROM invoices${index} ${where} ORDER BY date DESC,id DESC LIMIT 21 OFFSET ?`,
        )
        .bind(...rowArgs, offset),
    ];
    if (v.count === "1")
      statements.push(
        db
          .prepare(
            `SELECT COUNT(*) AS total FROM invoices${index} ${baseWhere}`,
          )
          .bind(...args),
      );
    const result = await db.batch(statements);
    const rows = result[0].results.slice(0, 20),
      last = rows.at(-1);
    res.json({
      data: rows.map(serialize),
      total: result[1]?.results[0].total,
      page: v.page,
      has_more: result[0].results.length > 20,
      next_cursor: last ? encodeCursor({ date: last.date, id: last.id }) : null,
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
          "SELECT cumulative AS quantity FROM invoices WHERE customer_id=? AND date=? AND (created_at,id)<(?,?) ORDER BY created_at DESC,id DESC LIMIT 1",
        )
        .bind(customer, date, old.created_at, exclude)
        .first();
    } else
      row = await db
        .prepare(
          "SELECT cumulative AS quantity FROM invoices WHERE customer_id=? AND date=? ORDER BY created_at DESC,id DESC LIMIT 1",
        )
        .bind(customer, date)
        .first();
    res.json({ data: (row?.quantity || 0) / 1000 });
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
    const v = parse(invoiceInput, req.body);
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw fail(400, "مفتاح حفظ الفاتورة غير صحيح، يرجى تحديث الصفحة");
    const fingerprint = await digest(JSON.stringify(v));
    const replay = async () => {
      const row = await db
        .prepare(
          "SELECT * FROM invoices WHERE created_by=? AND idempotency_key=?",
        )
        .bind(req.user.id, key)
        .first();
      if (!row) return false;
      if (row.request_hash !== fingerprint)
        throw fail(
          409,
          "تم استخدام مفتاح الحفظ لبيانات مختلفة، يرجى تحديث الصفحة",
        );
      res.status(201).json({
        data: row.creation_response
          ? serialize(JSON.parse(row.creation_response))
          : serialize(row),
        replayed: true,
      });
      return true;
    };
    if (await replay()) return;
    const names = await snapshots(db, v),
      all = { ...v, ...names, ...departureValues(v.departure) };
    let x;
    try {
      const insert = db
        .prepare(
          `INSERT INTO invoices(${cols.join(",")},created_by,audit_actor_id,audit_actor_email,idempotency_key,request_hash) VALUES(${cols.map(() => "?").join(",")},?,?,?,?,?)`,
        )
        .bind(
          ...cols.map((k) => all[k]),
          req.user.id,
          req.user.id,
          req.user.email,
          key,
          fingerprint,
        );
      const snapshotColumns = [
        "id",
        ...cols,
        "version",
        "requested",
        "truck_load",
        "previous",
        "cumulative",
        "created_by",
        "printed_at",
        "created_at",
        "updated_at",
        "audit_actor_id",
        "audit_actor_email",
      ];
      const unique = [...new Set(snapshotColumns)];
      const results = await db.batch([
        insert,
        db
          .prepare(
            `UPDATE invoices SET creation_response=json_object(${unique.map((k) => `'${k}',${k}`).join(",")}) WHERE created_by=? AND idempotency_key=? AND creation_response IS NULL`,
          )
          .bind(req.user.id, key),
      ]);
      x = results[0];
    } catch (error) {
      if (error.message?.includes("UNIQUE constraint") && (await replay()))
        return;
      throw error;
    }
    const row = await db
      .prepare("SELECT * FROM invoices WHERE id=?")
      .bind(x.meta.last_row_id)
      .first();
    res
      .status(201)
      .json({ data: serialize(JSON.parse(row.creation_response)) });
  });
  r.put("/:id", allow("ADMIN", "SUPER_ADMIN"), async (req, res) => {
    const uid = parse(id, req.params.id),
      v = parse(invoiceEdit, req.body);
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
        `UPDATE invoices SET ${cols.map((k) => `${k}=?`).join(",")},audit_actor_id=?,audit_actor_email=?,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND (printed_at IS NULL OR ?='SUPER_ADMIN') AND version=?`,
      )
      .bind(
        ...cols.map((k) => all[k]),
        req.user.id,
        req.user.email,
        uid,
        req.user.role,
        v.version,
      )
      .run();
    if (!x.meta.changes) {
      const current = await db
        .prepare("SELECT printed_at FROM invoices WHERE id=?")
        .bind(uid)
        .first();
      if (current?.printed_at && req.user.role !== "SUPER_ADMIN")
        throw fail(403, "لا يمكن تعديل الفاتورة بعد طباعتها");
      throw fail(
        409,
        "تم تعديل الفاتورة بواسطة مستخدم آخر، يرجى تحديث الصفحة قبل الحفظ",
      );
    }
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
        "UPDATE invoices SET audit_actor_id=?,audit_actor_email=?,version=version+1,printed_at=COALESCE(printed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id=?",
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
