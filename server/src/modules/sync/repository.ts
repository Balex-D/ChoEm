import type { Database, Queryable } from "../../db/database.js";
import type { AppState } from "./schema.js";
import { HttpError } from "../../common/errors.js";
// @ts-ignore Pure rule-based analysis shared with the PWA.
import { analyzeCycles } from "../../../../dist/js/cycle-analysis.js";
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
    "SELECT entry_date::text AS date,mood,symptoms,note,shared FROM journal_entries WHERE user_id=$1 ORDER BY entry_date",
    [userId],
  );
  const state: AppState = {
    name: p.name,
    symptomSuggestions: p.symptom_suggestions,
    starts: cycles.map((r) => r.start),
    ends: Object.fromEntries(
      cycles.filter((r) => r.end).map((r) => [r.start, r.end]),
    ),
    entries: Object.fromEntries(
      journal.map((r) => [
        r.date,
        { mood: r.mood, symptoms: r.symptoms, note: r.note, shared: r.shared },
      ]),
    ),
    privacy: {
      cycle: p.share_cycle,
      mood: p.share_mood,
      notes: p.share_notes,
      symptoms: p.share_symptoms,
    },
  };
  const { rows: forecasts } = await q.query(
    "SELECT anchor_date::text AS anchor,expected_start::text AS start,expected_end::text AS end,issued_at FROM cycle_forecasts WHERE user_id=$1 ORDER BY anchor_date",
    [userId],
  );
  state.forecasts = forecasts.map((row) => ({
    anchor: row.anchor,
    start: row.start,
    end: row.end,
    issuedAt: new Date(row.issued_at).toISOString(),
  }));
  return { state, revision: p.revision as number };
}
export async function getState(db: Database, userId: string) {
  return db.transaction(async (q) => {
    await q.query("SELECT user_id FROM profiles WHERE user_id=$1 FOR SHARE", [
      userId,
    ]);
    const current = await readState(q, userId);
    await ensureForecast(q, userId, current.state);
    return readState(q, userId);
  });
}
async function ensureForecast(q: Queryable, userId: string, state: AppState) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const analysis = analyzeCycles(state, today);
  if (analysis.nextPeriodStart)
    await q.query(
      `INSERT INTO cycle_forecasts(user_id,anchor_date,expected_start,expected_end) VALUES($1,$2,$3,$4)
    ON CONFLICT(user_id,anchor_date) DO UPDATE SET expected_start=excluded.expected_start,expected_end=excluded.expected_end,issued_at=now()
    WHERE cycle_forecasts.expected_start<>excluded.expected_start OR cycle_forecasts.expected_end<>excluded.expected_end`,
      [
        userId,
        analysis.lastPeriodStart,
        analysis.nextPeriodStart,
        analysis.nextPeriodEnd,
      ],
    );
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
      `UPDATE profiles SET name=$2,share_cycle=$3,share_mood=$4,share_notes=$5,revision=revision+1,updated_at=now() WHERE user_id=$1`,
      [
        userId,
        state.name,
        state.privacy.cycle,
        state.privacy.mood,
        state.privacy.notes,
      ],
    );
    await q.query("DELETE FROM cycles WHERE user_id=$1", [userId]);
    await q.query("UPDATE profiles SET share_symptoms=$2 WHERE user_id=$1", [
      userId,
      state.privacy.symptoms,
    ]);
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
        "INSERT INTO journal_entries(user_id,entry_date,mood,symptoms,note,shared) VALUES($1,$2,$3,$4::jsonb,$5,$6)",
        [
          userId,
          date,
          entry.mood,
          JSON.stringify(entry.symptoms),
          entry.note,
          entry.shared,
        ],
      );
    }
    await q.query(
      "DELETE FROM cycle_forecasts WHERE user_id=$1 AND NOT(anchor_date=ANY($2::date[]))",
      [userId, state.starts],
    );
    await ensureForecast(q, userId, state);
    const saved = await readState(q, userId);
    return { revision: revision + 1, forecasts: saved.state.forecasts };
  });
}
