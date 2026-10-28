import type { Database, Queryable } from "../../db/database.js";
import type { AppState } from "./schema.js";
import { HttpError } from "../../common/errors.js";
export async function readState(q: Queryable, userId: string) {
  const {
    rows: [p],
  } = await q.query("SELECT * FROM profiles WHERE user_id=$1", [userId]);
  if (!p) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy tài khoản.");
  const { rows: cycles } = await q.query(
    "SELECT start_date::text AS start,end_date::text AS end FROM cycles WHERE user_id=$1 ORDER BY start_date",
    [userId],
  );
  const { rows: journal } = await q.query(
    "SELECT entry_date::text AS date,mood,symptoms,note FROM journal_entries WHERE user_id=$1 ORDER BY entry_date",
    [userId],
  );
  const state: AppState = {
    name: p.name,
    length: p.cycle_length,
    duration: p.period_duration,
    symptomSuggestions: p.symptom_suggestions,
    starts: cycles.map((r) => r.start),
    ends: Object.fromEntries(
      cycles.filter((r) => r.end).map((r) => [r.start, r.end]),
    ),
    entries: Object.fromEntries(
      journal.map((r) => [
        r.date,
        { mood: r.mood, symptoms: r.symptoms, note: r.note },
      ]),
    ),
    privacy: { cycle: p.share_cycle, mood: p.share_mood, notes: p.share_notes },
  };
  return { state, revision: p.revision as number };
}
export async function getState(db: Database, userId: string) {
  return db.transaction(async (q) => {
    await q.query("SELECT user_id FROM profiles WHERE user_id=$1 FOR SHARE", [
      userId,
    ]);
    return readState(q, userId);
  });
}
export async function saveState(
  db: Database,
  userId: string,
  state: AppState,
  revision: number,
) {
  return db.transaction(async (q) => {
    const {
      rows: [profile],
    } = await q.query(
      "SELECT revision FROM profiles WHERE user_id=$1 FOR UPDATE",
      [userId],
    );
    if (!profile)
      throw new HttpError(404, "NOT_FOUND", "Không tìm thấy tài khoản.");
    if (profile.revision !== revision)
      throw new HttpError(
        409,
        "SYNC_CONFLICT",
        "Dữ liệu đã thay đổi trên thiết bị khác. Hãy chọn bản muốn giữ.",
        await readState(q, userId),
      );
    await q.query(
      `UPDATE profiles SET name=$2,cycle_length=$3,period_duration=$4,share_cycle=$5,share_mood=$6,share_notes=$7,revision=revision+1,updated_at=now() WHERE user_id=$1`,
      [
        userId,
        state.name,
        state.length,
        state.duration,
        state.privacy.cycle,
        state.privacy.mood,
        state.privacy.notes,
      ],
    );
    await q.query("DELETE FROM cycles WHERE user_id=$1", [userId]);
    await q.query(
      "UPDATE profiles SET symptom_suggestions=$2::jsonb WHERE user_id=$1",
      [userId, JSON.stringify(state.symptomSuggestions)],
    );
    for (const start of state.starts)
      await q.query(
        "INSERT INTO cycles(user_id,start_date,end_date) VALUES($1,$2,$3)",
        [userId, start, state.ends[start] || null],
      );
    await q.query("DELETE FROM journal_entries WHERE user_id=$1", [userId]);
    for (const [date, entry] of Object.entries(state.entries)) {
      await q.query(
        "INSERT INTO journal_entries(user_id,entry_date,mood,symptoms,note) VALUES($1,$2,$3,$4::jsonb,$5)",
        [userId, date, entry.mood, JSON.stringify(entry.symptoms), entry.note],
      );
    }
    return { revision: revision + 1 };
  });
}
