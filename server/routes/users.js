import { Router } from "express";
import { z } from "zod";
import { allow } from "../middleware/auth.js";
import {
  parse,
  userInput,
  userEdit,
  password,
  id,
  fail,
} from "../validation/index.js";
import { hashPassword } from "../services/crypto.js";
export function userRoutes(db) {
  const r = Router();
  r.use(allow("SUPER_ADMIN"));
  r.get("/", async (req, res) =>
    res.json({
      data: (
        await db.prepare("SELECT id,email,role FROM users ORDER BY id").all()
      ).results,
    }),
  );
  r.post("/", async (req, res) => {
    const v = parse(userInput, req.body);
    const u = await db
      .prepare(
        "INSERT INTO users(email,password_hash,role) VALUES(?,?,?) RETURNING id,email,role",
      )
      .bind(v.email, await hashPassword(v.password), v.role)
      .first();
    res.status(201).json({ data: u });
  });
  r.put("/:id", async (req, res) => {
    const uid = parse(id, req.params.id),
      v = parse(userEdit, req.body);
    if (uid === req.user.id && v.role !== "SUPER_ADMIN")
      throw fail(400, "لا يمكنك تغيير دور حسابك الحالي");
    const result = await db.batch([
      db
        .prepare(
          "UPDATE users SET email=?,role=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND (role<>'SUPER_ADMIN' OR ?='SUPER_ADMIN') RETURNING id,email,role",
        )
        .bind(v.email, v.role, uid, v.role),
      db
        .prepare(
          "DELETE FROM sessions WHERE user_id=? AND user_id<>? AND EXISTS(SELECT 1 FROM users WHERE id=? AND email=? AND role=?)",
        )
        .bind(uid, req.user.id, uid, v.email, v.role),
    ]);
    if (!result[0].results.length) {
      const target = await db
        .prepare("SELECT role FROM users WHERE id=?")
        .bind(uid)
        .first();
      if (target?.role === "SUPER_ADMIN")
        throw fail(403, "لا يمكن تخفيض دور مدير النظام العام من خلال النظام");
      throw fail(404, "المستخدم غير موجود");
    }
    res.json({ data: result[0].results[0] });
  });
  r.post("/:id/password", async (req, res) => {
    const uid = parse(id, req.params.id),
      v = parse(z.object({ password }).strict(), req.body);
    const result = await db.batch([
      db
        .prepare(
          "UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .bind(await hashPassword(v.password), uid),
      db.prepare("DELETE FROM sessions WHERE user_id=?").bind(uid),
    ]);
    if (!result[0].meta.changes) throw fail(404, "المستخدم غير موجود");
    res.json({ data: true });
  });
  r.delete("/:id", async (req, res) => {
    const uid = parse(id, req.params.id);
    if (uid === req.user.id) throw fail(400, "لا يمكنك حذف حسابك الحالي");
    const x = await db
      .prepare("DELETE FROM users WHERE id=? AND role<>'SUPER_ADMIN'")
      .bind(uid)
      .run();
    if (!x.meta.changes) {
      const target = await db
        .prepare("SELECT role FROM users WHERE id=?")
        .bind(uid)
        .first();
      if (target?.role === "SUPER_ADMIN")
        throw fail(403, "لا يمكن حذف مدير النظام العام من خلال النظام");
      throw fail(404, "المستخدم غير موجود");
    }
    res.json({ data: true });
  });
  return r;
}
