import type { RequestHandler, Response, Request } from "express";
import type { Database } from "../../db/database.js";
import { hashToken, randomToken } from "../../common/security.js";
import { HttpError } from "../../common/errors.js";
import type { Config } from "../../config.js";
export interface Identity {
  id: string;
  email: string;
}
declare global {
  namespace Express {
    interface Request {
      user?: Identity;
    }
  }
}
const cookieName = "ce_session";
function getCookie(req: Request) {
  const token = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export async function createSession(
  db: Database,
  userId: string,
  res: Response,
  c: Config,
) {
  const token = randomToken();
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
    [hashToken(token), userId],
  );
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: c.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 30 * 86400000,
  });
}
export function authenticate(db: Database): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = getCookie(req);
      if (!token)
        throw new HttpError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập.");
      const { rows } = await db.query(
        "SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
        [hashToken(token)],
      );
      if (!rows.length)
        throw new HttpError(
          401,
          "UNAUTHENTICATED",
          "Phiên đăng nhập đã hết hạn.",
        );
      req.user = rows[0] as Identity;
      next();
    } catch (error) {
      next(error);
    }
  };
}
export async function destroySession(
  db: Database,
  req: Request,
  res: Response,
  c: Config,
) {
  const token = getCookie(req);
  if (token)
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [
      hashToken(token),
    ]);
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: c.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}
