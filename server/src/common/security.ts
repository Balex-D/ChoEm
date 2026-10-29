import {
  createHash,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
import type { Request, RequestHandler } from "express";
import type { Database } from "../db/database.js";
import { HttpError } from "./errors.js";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const randomToken = () => randomBytes(32).toString("hex");
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      64,
      { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [kind, salt, hash] = encoded.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const actual = await derive(password, salt),
    expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function limit(
  db: Database,
  scope: string,
  maximum: number,
  minutes = 15,
  identity: (req: Request) => string = (req) => req.ip || "unknown",
): RequestHandler {
  return async (req, res, next) => {
    try {
      const bucket = hashToken(`${scope}:${identity(req)}`);
      const { rows } = await db.query(
        `INSERT INTO rate_limits(bucket,attempts,reset_at) VALUES($1,1,now()+$2::interval)
        ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN rate_limits.reset_at<=now() THEN 1 ELSE rate_limits.attempts+1 END,
        reset_at=CASE WHEN rate_limits.reset_at<=now() THEN now()+$2::interval ELSE rate_limits.reset_at END RETURNING attempts,reset_at`,
        [bucket, `${minutes} minutes`],
      );
      if (rows[0].attempts > maximum) {
        res.setHeader(
          "Retry-After",
          String(
            Math.max(
              1,
              Math.ceil(
                (new Date(rows[0].reset_at).getTime() - Date.now()) / 1000,
              ),
            ),
          ),
        );
        throw new HttpError(
          429,
          "RATE_LIMIT",
          "Thao tác hơi nhanh. Vui lòng thử lại sau.",
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
