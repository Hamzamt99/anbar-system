import { z } from "zod";
import { encodeCursor, decodeCursor } from "../services/pagination.js";
import { Router } from "express";
import { allow } from "../middleware/auth.js";
import { parse, nameInput, id, fail } from "../validation/index.js";
// Table names originate exclusively from this fixed allowlist, never request values.
export const masters = {
  customers: "customers",
  drivers: "drivers",
  "mix-types": "mix_types",
  vehicles: "vehicles",
  pumps: "pumps",
  mixers: "mixers",
};
export function masterRoutes(db) {
  const r = Router();
  for (const [path, table] of Object.entries(masters)) {
    r.get(`/${path}`, async (req, res) => {
      const v = parse(
        z
          .object({
            search: z.string().max(200).default(""),
            include_deleted: z.literal("1").optional(),
            cursor: z.string().max(1000).optional(),
            limit: z.coerce.number().int().min(1).max(100).default(50),
          })
          .strict(),
        req.query,
      );
      if (v.include_deleted && req.user.role === "DATA_ENTRY")
        throw fail(403, "ليس لديك صلاحية لهذا الإجراء");
      const parts = [],
        args = [];
      if (!v.include_deleted) parts.push("deleted_at IS NULL");
      if (v.search) {
        parts.push("name LIKE ? ESCAPE '\\'");
        args.push("%" + v.search.replace(/[\\%_]/g, "\\$&") + "%");
      }
      if (v.cursor) {
        const p = decodeCursor(v.cursor, "master");
        if (
          typeof p?.name !== "string" ||
          p.name.length > 200 ||
          !Number.isSafeInteger(p.id) ||
          p.id < 1
        )
          throw fail(400, "مؤشر الصفحة غير صحيح");
        parts.push("(name COLLATE NOCASE,id)>(?,?)");
        args.push(p.name, p.id);
      }
      const where = parts.length ? "WHERE " + parts.join(" AND ") : "";
      const rows = (
        await db
          .prepare(
            `SELECT id,name FROM ${table} ${where} ORDER BY name COLLATE NOCASE,id LIMIT ?`,
          )
          .bind(...args, v.limit + 1)
          .all()
      ).results;
      const visible = rows.slice(0, v.limit);
      res.json({
        data: visible,
        has_more: rows.length > v.limit,
        next_cursor: visible.length ? encodeCursor(visible.at(-1)) : null,
      });
    });

    r.post(`/${path}`, allow("ADMIN", "SUPER_ADMIN"), async (req, res) => {
      const { name } = parse(nameInput, req.body);
      const x = await db
        .prepare(`INSERT INTO ${table}(name) VALUES(?) RETURNING id,name`)
        .bind(name)
        .first();
      res.status(201).json({ data: x });
    });
    r.put(`/${path}/:id`, allow("ADMIN", "SUPER_ADMIN"), async (req, res) => {
      const { name } = parse(nameInput, req.body);
      const x = await db
        .prepare(
          `UPDATE ${table} SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL RETURNING id,name`,
        )
        .bind(name, parse(id, req.params.id))
        .first();
      if (!x) throw fail(404, "السجل غير موجود");
      res.json({ data: x });
    });
    r.delete(
      `/${path}/:id`,
      allow("ADMIN", "SUPER_ADMIN"),
      async (req, res) => {
        const x = await db
          .prepare(
            `UPDATE ${table} SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL`,
          )
          .bind(parse(id, req.params.id))
          .run();
        if (!x.meta.changes) throw fail(404, "السجل غير موجود");
        res.json({ data: true });
      },
    );
  }
  return r;
}
