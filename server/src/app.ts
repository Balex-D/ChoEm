import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { ZodError } from "zod";
import type { Config } from "./config.js";
import type { Database } from "./db/database.js";
import { HttpError } from "./common/errors.js";
import { limit } from "./common/security.js";
import { authRoutes } from "./modules/auth/routes.js";
import { syncRoutes } from "./modules/sync/routes.js";
import { connectionRoutes } from "./modules/connections/routes.js";
export function createApp(db: Database, c: Config) {
  const app = express();
  app.disable("x-powered-by");
  if (c.TRUST_PROXY_HOPS) app.set("trust proxy", c.TRUST_PROXY_HOPS);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: c.NODE_ENV === "production" ? [] : null,
        },
      },
      strictTransportSecurity: c.NODE_ENV === "production" ? undefined : false,
    }),
  );
  app.use((req, res, next) => {
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    if (c.NODE_ENV !== "test")
      res.on("finish", () =>
        console.log(
          JSON.stringify({
            requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
          }),
        ),
      );
    next();
  });
  app.get("/healthz", async (_req, res) => {
    await db.query("SELECT 1");
    res.json({ status: "ok" });
  });
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (
        req.get("Origin") !== c.APP_ORIGIN ||
        req.get("X-Cho-Em") !== "1" ||
        !req.is("application/json")
      )
        return next(
          new HttpError(
            403,
            "CSRF_REJECTED",
            "Yêu cầu không hợp lệ. Hãy mở ứng dụng từ địa chỉ chính thức.",
          ),
        );
    }
    next();
  });
  app.use("/api", limit(db, "api", 800));
  app.use(express.json({ limit: "2mb" }));
  app.use("/api/auth", authRoutes(db, c));
  app.use("/api/state", syncRoutes(db));
  app.use("/api/connections", connectionRoutes(db, c));
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "NOT_FOUND", "Không tìm thấy API.")),
  );
  app.get("/sw.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(resolve("dist/sw.js"));
  });
  app.use(
    express.static(resolve("dist"), {
      index: "index.html",
      etag: true,
      maxAge: 0,
    }),
  );
  app.use((_req, _res, next) =>
    next(new HttpError(404, "NOT_FOUND", "Không tìm thấy trang.")),
  );
  const errors: ErrorRequestHandler = (error, req, res, _next) => {
    if (error instanceof ZodError)
      return void res
        .status(400)
        .json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Dữ liệu chưa hợp lệ.",
            issues: error.issues.map((i) => ({
              path: i.path,
              message: i.message,
            })),
          },
        });
    if (error instanceof HttpError)
      return void res
        .status(error.status)
        .json({
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
        });
    if (error.code === "23505")
      return void res
        .status(409)
        .json({
          error: {
            code: "ALREADY_EXISTS",
            message: "Email hoặc kết nối đã tồn tại.",
          },
        });
    if (error.type === "entity.too.large")
      return void res
        .status(413)
        .json({
          error: { code: "TOO_LARGE", message: "Dữ liệu vượt giới hạn 2 MB." },
        });
    if (error.type === "entity.parse.failed")
      return void res
        .status(400)
        .json({
          error: {
            code: "INVALID_JSON",
            message: "Dữ liệu JSON không hợp lệ.",
          },
        });
    console.error(
      JSON.stringify({
        requestId: res.getHeader("X-Request-Id"),
        code: "INTERNAL_ERROR",
        type: error.constructor?.name,
      }),
    );
    res
      .status(500)
      .json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.",
        },
      });
  };
  app.use(errors);
  return app;
}
