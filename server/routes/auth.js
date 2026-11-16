import { Router } from "express";
import { parse, login, fail } from "../validation/index.js";
import {
  verifyPassword,
  hashPassword,
  token,
  digest,
} from "../services/crypto.js";
export function authRoutes(db) {
  const r = Router();
  r.post("/login", async (req, res) => {
    const v = parse(login, req.body);
    const key = await digest(
      `${req.headers["cf-connecting-ip"] || req.ip}:${v.email}`,
    );
    const now = Date.now();
    await db
      .prepare(
        "INSERT INTO login_attempts(key,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<? THEN ? ELSE reset_at END",
      )
      .bind(key, now + 900000, now, now, now + 900000)
      .run();
    const attempt = await db
      .prepare("SELECT attempts FROM login_attempts WHERE key=?")
      .bind(key)
      .first();
    if (attempt.attempts > 10)
      throw fail(429, "محاولات كثيرة، يرجى المحاولة بعد 15 دقيقة");
    const u = await db
      .prepare("SELECT * FROM users WHERE email=?")
      .bind(v.email)
      .first();
    const dummy =
      "pbkdf2$100000$00000000000000000000000000000000$" + "0".repeat(64);
    const valid = await verifyPassword(v.password, u?.password_hash || dummy);
    if (!u || !valid)
      throw fail(401, "البريد الإلكتروني أو كلمة المرور غير صحيحة");
    const raw = token();
    await db.batch([
      db.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now),
      db.prepare("DELETE FROM login_attempts WHERE key=?").bind(key),
      db
        .prepare(
          "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
        )
        .bind(await digest(raw), u.id, now + 28800000),
    ]);
    res.cookie("anbar_session", raw, {
      httpOnly: true,
      secure: req.secure || req.headers["x-forwarded-proto"] === "https",
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
