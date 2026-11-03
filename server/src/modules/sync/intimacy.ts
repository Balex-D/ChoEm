import type { Database } from "../../db/database.js";
import { HttpError } from "../../common/errors.js";
// @ts-ignore Shared timezone helper.
import { vietnamDay } from "../../../../shared/dates.js";

export async function recordIntimacy(
  db: Database,
  actorId: string,
  date: string,
  recorded: boolean,
  revision: number,
  connectionId?: string,
) {
  if (date > vietnamDay())
    throw new HttpError(
      400,
      "FUTURE_DATE",
      "Em chỉ ghi nhận những ngày đã diễn ra nhé.",
    );
  return db.transaction(async (q) => {
    let ownerId = actorId;
    if (connectionId) {
      const { rows } = await q.query(
        "SELECT owner_id FROM connections WHERE id=$1 AND companion_id=$2 FOR SHARE",
        [connectionId, actorId],
      );
      if (!rows[0])
        throw new HttpError(404, "NOT_FOUND", "Kết nối không còn tồn tại.");
      ownerId = rows[0].owner_id;
    }
    const {
      rows: [profile],
    } = await q.query(
      "SELECT revision,share_intimacy,companion_edit_intimacy,sharing_paused FROM profiles WHERE user_id=$1 FOR UPDATE",
      [ownerId],
    );
    if (!profile)
      throw new HttpError(404, "NOT_FOUND", "Không tìm thấy tài khoản.");
    if (
      connectionId &&
      (!profile.share_intimacy ||
        !profile.companion_edit_intimacy ||
        profile.sharing_paused)
    )
      throw new HttpError(
        403,
        "INTIMACY_EDIT_FORBIDDEN",
        "Em chưa cho phép Anh chỉnh sửa ngày quan hệ hoặc đang tạm dừng chia sẻ.",
      );
    // Never attach the owner's private state to a companion conflict response.
    if (profile.revision !== revision)
      throw new HttpError(
        409,
        "INTIMACY_CONFLICT",
        "Lịch vừa được cập nhật. Hãy làm mới và chọn lại ngày nhé.",
      );
    if (recorded)
      await q.query(
        "INSERT INTO intimacy_days(user_id,record_date) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [ownerId, date],
      );
    else
      await q.query(
        "DELETE FROM intimacy_days WHERE user_id=$1 AND record_date=$2",
        [ownerId, date],
      );
    await q.query(
      "UPDATE profiles SET revision=revision+1,updated_at=now() WHERE user_id=$1",
      [ownerId],
    );
    return { date, recorded, revision: revision + 1 };
  });
}
