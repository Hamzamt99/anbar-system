import { securityHeaders, logEvent } from "./security.js";
import express from "express";
import { auth } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { masterRoutes } from "./routes/master.js";
import { invoiceRoutes } from "./routes/invoices.js";
import { userRoutes } from "./routes/users.js";
import { auditRoutes } from "./routes/audit.js";
export function createApp(db, { production = false } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", production ? 1 : false);
  app.locals.production = production;
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.on("finish", () => {
      if (res.statusCode >= 400)
        logEvent(
          req.path === "/api/auth/login"
            ? "login_failure"
            : res.statusCode >= 500
              ? "api_failure"
              : "api_rejected",
          res.statusCode,
          req.requestId,
        );
    });
    res.set({
      ...securityHeaders,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
    });
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      if (
        (origin && origin !== `${req.protocol}://${req.headers.host}`) ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        return res.status(403).json({ error: "مصدر الطلب غير مسموح" });
      if (req.headers["content-type"]?.split(";")[0] !== "application/json")
        return res.status(415).json({ error: "صيغة الطلب غير صحيحة" });
    }
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.use("/api/auth", authRoutes(db));
  app.use("/api", auth(db));
  app.get("/api/auth/me", (req, res) => res.json({ data: req.user }));
  app.use("/api/audit-logs", auditRoutes(db));
  app.use("/api/users", userRoutes(db));
  app.use("/api/invoices", invoiceRoutes(db));
  app.use("/api", masterRoutes(db));
  app.use((req, res) => res.status(404).json({ error: "المسار غير موجود" }));
  app.use((err, req, res, next) => {
    const duplicate = err.message?.includes("UNIQUE constraint");
    let status = duplicate ? 409 : err.status || 500;
    if (status >= 500)
      logEvent(
        err.message?.includes("D1") ? "d1_failure" : "internal_error",
        500,
        req.requestId,
      );
    res.status(status).json({
      error: duplicate
        ? "القيمة مسجلة مسبقاً"
        : status >= 500
          ? "تعذر إتمام العملية، يرجى المحاولة مجدداً"
          : err.type === "entity.parse.failed"
            ? "صيغة الطلب غير صحيحة"
            : err.message,
    });
  });
  return app;
}
