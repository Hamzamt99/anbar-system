import { Router } from "express";
import { parse, login, fail } from "../validation/index.js";
import {
  verifyPassword,
  hashPassword,
  token,
  digest,
  needsRehash,
} from "../services/crypto.js";
export function authRoutes(db) {
  const r = Router();
  r.post("/login", async (req, res) => {
    const v = parse(login, req.body);
    const key = await digest(
      `${(req.app.locals.production ? req.headers["cf-connecting-ip"] : req.socket.remoteAddress) || "unknown"}:${v.email}`,
    );
    const now = Date.now();
    const attempt = await db
      .prepare(
        "INSERT INTO login_attempts(key,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<? THEN ? ELSE reset_at END RETURNING attempts",
      )
      .bind(key, now + 900000, now, now, now + 900000)
      .first();
    if (attempt.attempts > 10)
      throw fail(429, "محاولات كثيرة، يرجى المحاولة بعد 15 دقيقة");
    const u = await db
      .prepare("SELECT * FROM users WHERE email=?")
      .bind(v.email)
      .first();
    const dummy =
      "pbkdf2$600000$00000000000000000000000000000000$" + "0".repeat(64);
    const valid = await verifyPassword(v.password, u?.password_hash || dummy);
    if (u && !valid && needsRehash(u.password_hash))
      await hashPassword(v.password, "0".repeat(32), 500000);
    if (!u || !valid)
      throw fail(401, "البريد الإلكتروني أو كلمة المرور غير صحيحة");
    if (needsRehash(u.password_hash)) {
      const upgraded = await hashPassword(v.password);
      const changed = await db
        .prepare(
          "UPDATE users SET password_hash=? WHERE id=? AND password_hash=?",
        )
        .bind(upgraded, u.id, u.password_hash)
        .run();
      if (!changed.meta.changes) throw fail(401, "يرجى إعادة تسجيل الدخول");
      u.password_hash = upgraded;
    }
    const raw = token();
    const result = await db.batch([
      db.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now),
      db.prepare("DELETE FROM login_attempts WHERE reset_at<?").bind(now),
      db.prepare("DELETE FROM login_attempts WHERE key=?").bind(key),
      db
        .prepare(
          "INSERT INTO sessions(token_hash,user_id,expires_at) SELECT ?,id,? FROM users WHERE id=? AND password_hash=?",
        )
        .bind(await digest(raw), now + 28800000, u.id, u.password_hash),
    ]);
    if (!result.at(-1).meta.changes) throw fail(401, "يرجى إعادة تسجيل الدخول");
    res.cookie("anbar_session", raw, {
      httpOnly: true,
      secure: req.app.locals.production || req.secure,
      sameSite: "strict",
      maxAge: 28800000,
      path: "/",
    });
    res.json({ data: { id: u.id, email: u.email, role: u.role } });
  });
  r.post("/logout", async (req, res) => {
    const raw = req.headers.cookie?.match(
      /(?:^|;\s*)anbar_session=([^;]+)/,
    )?.[1];
    if (raw)
      await db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await digest(raw))
        .run();
    res.clearCookie("anbar_session", {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
    });
    res.json({ data: true });
  });
  return r;
}
