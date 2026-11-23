import {
  encodeCursor,
  decodeCursor,
  predicate,
} from "../services/pagination.js";
import { Router } from "express";
import { z } from "zod";
import { allow } from "../middleware/auth.js";
import { parse, id, date } from "../validation/index.js";
const filters = z
  .object({
    invoice_id: id.optional(),
    email: z.string().trim().max(254).optional(),
    action: z.enum(["CREATE", "UPDATE", "PRINT"]).optional(),
    from: date.optional(),
    to: date.optional(),
    cursor: z
      .string()
      .max(500)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    count: z.enum(["0", "1"]).default("1"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, "نطاق التاريخ غير صحيح");
export function auditRoutes(db) {
  const r = Router();
  r.use(allow("SUPER_ADMIN"));
  r.get("/", async (req, res) => {
    const v = parse(filters, req.query);
    const from = v.from
        ? new Date(`${v.from}T00:00:00+03:00`).toISOString()
        : null,
      to = v.to ? new Date(`${v.to}T23:59:59.999+03:00`).toISOString() : null;
    const parts = [],
      args = [];
    predicate(parts, args, "invoice_id=?", v.invoice_id);
    if (v.email) predicate(parts, args, "actor_email LIKE ?", `%${v.email}%`);
    predicate(parts, args, "action=?", v.action);
    predicate(parts, args, "created_at>=?", from || undefined);
    predicate(parts, args, "created_at<=?", to || undefined);
    const baseWhere = parts.length ? "WHERE " + parts.join(" AND ") : "";
    const position = decodeCursor(v.cursor, "audit"),
      rowArgs = [...args];
    let where = baseWhere;
    if (position) {
      where += (where ? " AND " : "WHERE ") + "id<?";
      rowArgs.push(position.id);
    }
    if (!position && v.page > 100)
      throw Object.assign(new Error("يرجى التنقل باستخدام التالي والسابق"), {
        status: 400,
      });
    const statements = [
      db
        .prepare(
          `SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT 21 OFFSET ?`,
        )
        .bind(...rowArgs, position ? 0 : (v.page - 1) * 20),
    ];
    if (v.count === "1")
      statements.push(
        db
          .prepare(`SELECT COUNT(*) AS total FROM audit_logs ${baseWhere}`)
          .bind(...args),
      );
    const rows = await db.batch(statements),
      visible = rows[0].results.slice(0, 20);
    res.json({
      data: visible.map((row) => ({
        ...row,
        before: row.before_data ? JSON.parse(row.before_data) : null,
        after: JSON.parse(row.after_data),
        before_data: undefined,
        after_data: undefined,
      })),
      total: rows[1]?.results[0].total,
      has_more: rows[0].results.length > 20,
      next_cursor: visible.length
        ? encodeCursor({ id: visible.at(-1).id })
        : null,
      page: v.page,
    });
  });
  return r;
}
