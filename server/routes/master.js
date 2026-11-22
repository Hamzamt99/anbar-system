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
      if (
        Object.keys(req.query).some(
          (k) => !["search", "include_deleted"].includes(k),
        ) ||
        (req.query.include_deleted !== undefined &&
          req.query.include_deleted !== "1") ||
        typeof (req.query.search ?? "") !== "string" ||
        (req.query.search || "").length > 200
      )
        throw fail(400, "البحث غير صحيح");
      if (req.query.include_deleted && req.user.role === "DATA_ENTRY")
        throw fail(403, "ليس لديك صلاحية لهذا الإجراء");
      res.json({
        data: (
          await db
            .prepare(
              `SELECT id,name FROM ${table} WHERE (?=1 OR deleted_at IS NULL) AND name LIKE ? ORDER BY name`,
            )
            .bind(
              req.query.include_deleted === "1" ? 1 : 0,
              `%${req.query.search || ""}%`,
            )
            .all()
        ).results,
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
