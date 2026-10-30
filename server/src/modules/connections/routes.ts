import { Router } from "express";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";
import type { Database } from "../../db/database.js";
import type { Config } from "../../config.js";
import { authenticate } from "../auth/session.js";
import { hashToken, limit } from "../../common/security.js";
import { issueInvite } from "./invites.js";
import { HttpError } from "../../common/errors.js";
import { dateSchema } from "../sync/schema.js";
import { readState } from "../sync/repository.js";
import { sharedSummary, sharedDetails } from "./service.js";
export function connectionRoutes(db: Database, c: Config) {
  const router = Router();
  router.use(authenticate(db));
  router.get("/", async (req, res) => {
    const { rows } = await db.query(
      `SELECT c.id,c.owner_id,c.companion_id,p.name AS owner_name,p2.name AS companion_name FROM connections c
      JOIN profiles p ON p.user_id=c.owner_id JOIN profiles p2 ON p2.user_id=c.companion_id WHERE c.owner_id=$1 OR c.companion_id=$1`,
      [req.user!.id],
    );
    res.json({
      connections: rows.map((r) => ({
        id: r.id,
        role: r.owner_id === req.user!.id ? "owner" : "companion",
        name: r.owner_id === req.user!.id ? r.companion_name : r.owner_name,
      })),
    });
  });
  router.post("/invites", limit(db, "invite", 15), async (req, res) => {
    if (req.user!.role !== "em")
      throw new HttpError(
        403,
        "ROLE_REQUIRED",
        "Chỉ vai trò Em được tạo mã mời.",
      );
    const expiry = new Date(Date.now() + 2 * 60000);
    const token = await db.transaction(async (q) => {
      const {
        rows: [user],
      } = await q.query("SELECT role FROM users WHERE id=$1 FOR UPDATE", [
        req.user!.id,
      ]);
      if (user.role !== "em")
        throw new HttpError(
          403,
          "ROLE_REQUIRED",
          "Chỉ vai trò Em được tạo mã mời.",
        );
      const { rows: linked } = await q.query(
        "SELECT id FROM connections WHERE owner_id=$1 OR companion_id=$1",
        [req.user!.id],
      );
      if (linked.length)
        throw new HttpError(
          409,
          "ALREADY_CONNECTED",
          "Tài khoản đã có người đồng hành. Hãy ngắt kết nối trước khi tạo mã mới.",
        );
      return issueInvite(q, req.user!.id, expiry);
    });
    const url = `${c.APP_ORIGIN}/#invite=${token}&v=2`;
    res.status(201).json({
      token,
      code: token,
      url,
      expiresAt: expiry.toISOString(),
      qr: await QRCode.toDataURL(url, { width: 256, margin: 2 }),
    });
  });
  router.delete("/invites", async (req, res) => {
    await db.query("DELETE FROM connection_invites WHERE owner_id=$1", [
      req.user!.id,
    ]);
    res.status(204).end();
  });
  router.post(
    "/accept",
    limit(db, "accept", 15),
    limit(db, "accept-account", 10, 15, (req) => req.user!.id),
    async (req, res) => {
      if (req.user!.role !== "anh")
        throw new HttpError(
          403,
          "ROLE_REQUIRED",
          "Chọn vai trò Anh để nhập mã người đồng hành.",
        );
      // Keep the existing token-only API for manual codes and older QR links.
      const input = z
        .object({
          token: z
            .string()
            .trim()
            .transform((value) =>
              /^[a-f0-9]{64}$/.test(value) ? value : value.toUpperCase(),
            )
            .pipe(z.string().regex(/^(?:[A-Z0-9]{6}|[a-f0-9]{64})$/))
            .optional(),
          code: z
            .string()
            .trim()
            .transform((value) =>
              /^[a-f0-9]{64}$/.test(value) ? value : value.toUpperCase(),
            )
            .pipe(z.string().regex(/^(?:[A-Z0-9]{6}|[a-f0-9]{64})$/))
            .optional(),
          ownerId: z.string().uuid().optional(),
        })
        .refine(
          (x) => Boolean(x.token) !== Boolean(x.code),
          "Cần một mã kết nối.",
        )
        .refine(
          (x) => !x.code || x.code.length === 6 || Boolean(x.ownerId),
          "Mã QR cần UUID tài khoản Em.",
        )
        .parse(req.body);
      const token = input.token || input.code!;
      const id = randomUUID();
      await db.transaction(async (q) => {
        const {
          rows: [candidate],
        } = await q.query(
          "SELECT owner_id FROM connection_invites WHERE token_hash=$1",
          [hashToken(token)],
        );
        if (
          !candidate ||
          (input.ownerId && candidate.owner_id !== input.ownerId)
        )
          throw new HttpError(
            404,
            "INVITE_EXPIRED",
            "Mã mời không hợp lệ, đã hết hạn hoặc đã được sử dụng.",
          );
        if (candidate) {
          const { rows: users } = await q.query(
            "SELECT id,role FROM users WHERE id=$1 OR id=$2 ORDER BY id FOR UPDATE",
            [candidate.owner_id, req.user!.id],
          );
          if (
            users.find((u) => u.id === req.user!.id)?.role !== "anh" ||
            users.find((u) => u.id === candidate.owner_id)?.role !== "em"
          )
            throw new HttpError(
              403,
              "ROLE_REQUIRED",
              "Kết nối cần vai trò Em tạo mã và Anh nhập mã.",
            );
        }
        const {
          rows: [invite],
        } = await q.query(
          "SELECT owner_id FROM connection_invites WHERE token_hash=$1 AND expires_at>now() FOR UPDATE",
          [hashToken(token)],
        );
        if (!invite)
          throw new HttpError(
            404,
            "INVITE_EXPIRED",
            "Mã mời đã hết hạn hoặc đã được sử dụng.",
          );
        if (invite.owner_id === req.user!.id)
          throw new HttpError(
            400,
            "SELF_CONNECTION",
            "Không thể kết nối với chính mình.",
          );
        const { rows: linked } = await q.query(
          "SELECT id FROM connections WHERE owner_id=$1 OR companion_id=$1 OR owner_id=$2 OR companion_id=$2",
          [invite.owner_id, req.user!.id],
        );
        if (linked.length)
          throw new HttpError(
            409,
            "ALREADY_CONNECTED",
            "Một trong hai tài khoản đã có kết nối. Hãy ngắt kết nối cũ trước.",
          );
        await q.query(
          "INSERT INTO connections(id,owner_id,companion_id) VALUES($1,$2,$3)",
          [id, invite.owner_id, req.user!.id],
        );
        await q.query("DELETE FROM connection_invites WHERE token_hash=$1", [
          hashToken(token),
        ]);
      });
      res.status(201).json({ id });
    },
  );
  router.delete("/:id", async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    await db.transaction(async (q) => {
      const { rows } = await q.query(
        "DELETE FROM connections WHERE id=$1 AND (owner_id=$2 OR companion_id=$2) RETURNING owner_id",
        [id, req.user!.id],
      );
      if (!rows.length)
        throw new HttpError(404, "NOT_FOUND", "Không tìm thấy kết nối.");
      await q.query("DELETE FROM connection_invites WHERE owner_id=$1", [
        rows[0].owner_id,
      ]);
    });
    res.status(204).end();
  });
  router.get("/:id/shared", async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const month = z
      .string()
      .regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/)
      .parse(req.query.month);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const shared = await db.transaction(async (q) => {
      const {
        rows: [link],
      } = await q.query(
        "SELECT owner_id FROM connections WHERE id=$1 AND companion_id=$2 FOR SHARE",
        [id, req.user!.id],
      );
      if (!link)
        throw new HttpError(404, "NOT_FOUND", "Không tìm thấy kết nối.");
      await q.query("SELECT user_id FROM profiles WHERE user_id=$1 FOR SHARE", [
        link.owner_id,
      ]);
      return sharedDetails(
        (await readState(q, link.owner_id)).state,
        today,
        month,
      );
    });
    res.json({ shared });
  });
  router.get("/:id/summary", async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const date = dateSchema.parse(req.query.date);
    const current = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (date !== current)
      throw new HttpError(
        400,
        "TODAY_ONLY",
        "Người đồng hành chỉ xem được ngày hôm nay (giờ Việt Nam).",
      );
    const summary = await db.transaction(async (q) => {
      // Keep authorization and privacy reads in the same transaction as data reads.
      const {
        rows: [link],
      } = await q.query(
        "SELECT owner_id FROM connections WHERE id=$1 AND companion_id=$2 FOR SHARE",
        [id, req.user!.id],
      );
      if (!link)
        throw new HttpError(404, "NOT_FOUND", "Không tìm thấy kết nối.");
      await q.query("SELECT user_id FROM profiles WHERE user_id=$1 FOR SHARE", [
        link.owner_id,
      ]);
      return sharedSummary((await readState(q, link.owner_id)).state, date);
    });
    res.json({ summary });
  });
  return router;
}
