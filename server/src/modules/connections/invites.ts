import { randomInt } from "node:crypto";
import type { Queryable } from "../../db/database.js";
import { hashToken } from "../../common/security.js";
import { HttpError } from "../../common/errors.js";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const generateInviteCode = () =>
  Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(
    "",
  );

// Caller holds the owner's user lock and a transaction. UNIQUE token_hash also
// resolves collisions between simultaneous issuers without aborting the transaction.
export async function issueInvite(
  q: Queryable,
  ownerId: string,
  expiresAt: Date,
  generate = generateInviteCode,
) {
  await q.query("DELETE FROM connection_invites WHERE owner_id=$1", [ownerId]);
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generate();
    const { rows } = await q.query(
      "INSERT INTO connection_invites(token_hash,owner_id,expires_at) VALUES($1,$2,$3) ON CONFLICT(token_hash) DO NOTHING RETURNING owner_id",
      [hashToken(code), ownerId, expiresAt],
    );
    if (rows.length) return code;
  }
  throw new HttpError(
    503,
    "INVITE_UNAVAILABLE",
    "Chưa cấp được mã mời. Vui lòng thử lại sau.",
  );
}
