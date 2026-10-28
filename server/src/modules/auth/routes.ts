import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "../../db/database.js";
import type { Config } from "../../config.js";
import { hashPassword, verifyPassword, limit } from "../../common/security.js";
import { HttpError } from "../../common/errors.js";
import { authenticate, createSession, destroySession } from "./session.js";
const credentials = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((x) => x.toLowerCase()),
  password: z.string().min(12).max(128),
});
export function authRoutes(db: Database, c: Config) {
  const router = Router();
  router.get("/me", authenticate(db), (req, res) =>
    res.json({ user: req.user }),
  );
  router.post("/register", limit(db, "register", 5), async (req, res) => {
    const input = credentials
      .extend({ name: z.string().trim().min(1).max(24).default("Em") })
      .parse(req.body);
    const id = randomUUID(),
      encoded = await hashPassword(input.password);
    await db.transaction(async (q) => {
      await q.query(
        "INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)",
        [id, input.email, encoded],
      );
      await q.query("INSERT INTO profiles(user_id,name) VALUES($1,$2)", [
        id,
        input.name,
      ]);
    });
    await createSession(db, id, res, c);
    res.status(201).json({ user: { id, email: input.email } });
  });
  // Precomputed on first login; absent accounts still run the same password derivation.
  let dummyHash: Promise<string> | undefined;
  router.post("/login", limit(db, "login", 12), async (req, res) => {
    const input = credentials.parse(req.body);
    const { rows } = await db.query(
      "SELECT id,email,password_hash FROM users WHERE email=$1",
      [input.email],
    );
    dummyHash ??= hashPassword("unavailable-account-placeholder");
    const valid = await verifyPassword(
      input.password,
      rows[0]?.password_hash || (await dummyHash),
    );
    if (!rows.length || !valid)
      throw new HttpError(
        401,
        "INVALID_CREDENTIALS",
        "Email hoặc mật khẩu chưa đúng.",
      );
    await createSession(db, rows[0].id, res, c);
    res.json({ user: { id: rows[0].id, email: rows[0].email } });
  });
  router.post("/logout", async (req, res) => {
    await destroySession(db, req, res, c);
    res.status(204).end();
  });
  router.post(
    "/change-password",
    authenticate(db),
    limit(db, "password", 8),
    async (req, res) => {
      const input = z
        .object({
          currentPassword: z.string().max(128),
          newPassword: z.string().min(12).max(128),
        })
        .parse(req.body);
      const { rows } = await db.query(
        "SELECT password_hash FROM users WHERE id=$1",
        [req.user!.id],
      );
      if (!(await verifyPassword(input.currentPassword, rows[0].password_hash)))
        throw new HttpError(
          401,
          "INVALID_CREDENTIALS",
          "Mật khẩu hiện tại chưa đúng.",
        );
      const encoded = await hashPassword(input.newPassword);
      await db.transaction(async (q) => {
        await q.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
          encoded,
          req.user!.id,
        ]);
        await q.query("DELETE FROM sessions WHERE user_id=$1", [req.user!.id]);
      });
      await createSession(db, req.user!.id, res, c);
      res.status(204).end();
    },
  );
  return router;
}
