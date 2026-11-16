import { digest } from "../services/crypto.js";
import { fail } from "../validation/index.js";
export function auth(db) {
  return async (req, res, next) => {
    const raw = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("anbar_session="))
      ?.slice(14);
    if (!raw) throw fail(401, "يرجى تسجيل الدخول");
    req.user = await db
      .prepare(
        "SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
      )
      .bind(await digest(raw), Date.now())
      .first();
    if (!req.user) throw fail(401, "انتهت الجلسة، يرجى تسجيل الدخول");
    next();
  };
}
export const allow =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role))
      throw fail(403, "ليس لديك صلاحية لهذا الإجراء");
    next();
  };
