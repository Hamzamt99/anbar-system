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
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, "نطاق التاريخ غير صحيح");
export function auditRoutes(db) {
  const r = Router();
  r.use(allow("SUPER_ADMIN"));
  r.get("/", async (req, res) => {
    const v = parse(filters, req.query);
    const where =
      "WHERE (? IS NULL OR invoice_id=?) AND (? IS NULL OR actor_email LIKE ?) AND (? IS NULL OR action=?) AND (? IS NULL OR created_at>=?) AND (? IS NULL OR created_at<=?)";
    const from = v.from
        ? new Date(`${v.from}T00:00:00+03:00`).toISOString()
        : null,
      to = v.to ? new Date(`${v.to}T23:59:59.999+03:00`).toISOString() : null;
    const args = [
      v.invoice_id ?? null,
      v.invoice_id ?? null,
      v.email || null,
      `%${v.email || ""}%`,
      v.action || null,
      v.action || null,
      from,
      from,
      to,
      to,
    ];
    const rows = await db.batch([
      db
        .prepare(
          `SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT 20 OFFSET ?`,
        )
        .bind(...args, (v.page - 1) * 20),
      db
        .prepare(`SELECT COUNT(*) AS total FROM audit_logs ${where}`)
        .bind(...args),
    ]);
    res.json({
      data: rows[0].results.map((row) => ({
        ...row,
        before: row.before_data ? JSON.parse(row.before_data) : null,
        after: JSON.parse(row.after_data),
        before_data: undefined,
        after_data: undefined,
      })),
      total: rows[1].results[0].total,
      page: v.page,
    });
  });
  return r;
}
