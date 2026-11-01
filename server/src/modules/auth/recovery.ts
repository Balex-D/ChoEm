import { Router } from "express";
import { z } from "zod";
import type { Config } from "../../config.js";
import type { Database } from "../../db/database.js";
import {
  hashPassword,
  hashToken,
  randomToken,
  limit,
  verifyPassword,
} from "../../common/security.js";
import { HttpError } from "../../common/errors.js";
import { authenticate, destroySession } from "./session.js";
import { emailEnabled, sendAccountEmail } from "./email.js";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export function recoveryRoutes(db: Database, c: Config) {
  const router = Router();
  router.get("/capabilities", (_req, res) =>
    res.json({ email: emailEnabled(c) }),
  );
  router.post(
    "/forgot-password",
    limit(db, "recovery-ip", 5),
    limit(db, "recovery-email", 3, 15, (req) =>
      String(req.body?.email || "")
        .trim()
        .toLowerCase(),
    ),
    async (req, res) => {
      const { email } = z
        .object({
          email: z
            .string()
            .trim()
            .email()
            .max(254)
            .transform((v) => v.toLowerCase()),
        })
        .parse(req.body);
      if (!emailEnabled(c))
        throw new HttpError(
          503,
          "EMAIL_UNAVAILABLE",
          "Chức năng email chưa được cấu hình.",
        );
      // Same public response whether an account exists; unverified addresses cannot reset passwords.
      const { rows } = await db.query(
        "SELECT id FROM users WHERE email=$1 AND email_verified_at IS NOT NULL",
        [email],
      );
      if (rows.length) {
        try {
          await issue(db, c, rows[0].id, email, "reset");
        } catch {
          console.error("Account recovery email delivery failed");
        }
      }
      res.json({
        message:
          "Nếu email đã được xác minh và có tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu.",
      });
    },
  );
  router.post(
    "/request-verification",
    authenticate(db),
    limit(db, "verify", 3, 15, (req) => req.user!.id),
    async (req, res) => {
      if (!req.user!.emailVerified)
        await issue(db, c, req.user!.id, req.user!.email, "verify");
      res.json({ message: "Hãy kiểm tra hộp thư để xác minh email." });
    },
  );
  router.post(
    "/verify-email",
    limit(db, "verify-token", 12),
    async (req, res) => {
      const { token } = z.object({ token: tokenSchema }).parse(req.body);
      await consume(db, token, "verify", async (q, userId) => {
        await q.query(
          "UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1",
          [userId],
        );
      });
      res.json({ message: "Đã xác minh email. Bạn có thể đăng nhập." });
    },
  );
  router.post(
    "/reset-password",
    limit(db, "reset-token", 8),
    async (req, res) => {
      const input = z
        .object({ token: tokenSchema, password: z.string().min(6).max(128) })
        .parse(req.body);
      const encoded = await hashPassword(input.password);
      await consume(db, input.token, "reset", async (q, userId) => {
        await q.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
          userId,
          encoded,
        ]);
        await q.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
      });
      res.json({
        message:
          "Đã đặt lại mật khẩu và thu hồi các phiên đăng nhập. Hãy đăng nhập lại.",
      });
    },
  );
  router.delete(
    "/account",
    authenticate(db),
    limit(db, "delete-account", 5),
    async (req, res) => {
      const { password, confirmation } = z
        .object({
          password: z.string().max(128),
          confirmation: z.literal("XÓA TÀI KHOẢN"),
        })
        .parse(req.body);
      const { rows } = await db.query(
        "SELECT password_hash FROM users WHERE id=$1",
        [req.user!.id],
      );
      if (!rows[0] || !(await verifyPassword(password, rows[0].password_hash)))
        throw new HttpError(401, "INVALID_CREDENTIALS", "Mật khẩu chưa đúng.");
      await db.transaction(async (q) => {
        const { rows: locked } = await q.query(
          "SELECT password_hash FROM users WHERE id=$1 FOR UPDATE",
          [req.user!.id],
        );
        if (locked[0]?.password_hash !== rows[0].password_hash)
          throw new HttpError(
            409,
            "ACCOUNT_CHANGED",
            "Mật khẩu đã thay đổi. Hãy thử lại.",
          );
        await q.query("DELETE FROM users WHERE id=$1", [req.user!.id]);
      });
      await destroySession(db, req, res, c);
      res.status(204).end();
    },
  );
  return router;
}

export async function issue(
  db: Database,
  c: Config,
  userId: string,
  email: string,
  purpose: "verify" | "reset",
) {
  if (!emailEnabled(c))
    throw new HttpError(
      503,
      "EMAIL_UNAVAILABLE",
      "Chức năng email chưa được cấu hình.",
    );
  const token = randomToken();
  await db.transaction(async (q) => {
    await q.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    await q.query(
      "DELETE FROM account_tokens WHERE user_id=$1 AND purpose=$2",
      [userId, purpose],
    );
    await q.query(
      "INSERT INTO account_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')",
      [hashToken(token), userId, purpose],
    );
  });
  try {
    await sendAccountEmail(c, email, purpose, token);
  } catch (error) {
    await db.query("DELETE FROM account_tokens WHERE token_hash=$1", [
      hashToken(token),
    ]);
    throw error;
  }
}

async function consume(
  db: Database,
  token: string,
  purpose: string,
  run: (
    q: import("../../db/database.js").Queryable,
    userId: string,
  ) => Promise<void>,
) {
  await db.transaction(async (q) => {
    // Consistent user -> token lock order also serializes concurrent issuance and consumption.
    const { rows: candidate } = await q.query(
      "SELECT user_id FROM account_tokens WHERE token_hash=$1 AND purpose=$2",
      [hashToken(token), purpose],
    );
    if (!candidate[0]) throw invalidToken();
    await q.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
      candidate[0].user_id,
    ]);
    const { rows } = await q.query(
      "DELETE FROM account_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now() RETURNING user_id",
      [hashToken(token), purpose],
    );
    if (!rows[0]) throw invalidToken();
    await run(q, rows[0].user_id);
    await q.query(
      "DELETE FROM account_tokens WHERE user_id=$1 AND purpose=$2",
      [rows[0].user_id, purpose],
    );
  });
}
const invalidToken = () =>
  new HttpError(
    400,
    "TOKEN_INVALID",
    "Liên kết không hợp lệ, đã dùng hoặc đã hết hạn.",
  );
