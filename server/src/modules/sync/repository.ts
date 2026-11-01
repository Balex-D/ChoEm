// @ts-ignore Shared timezone helper.
import { vietnamDay } from "../../../../shared/dates.js";
import type { Database, Queryable } from "../../db/database.js";
import type { AppState } from "./schema.js";
import { HttpError } from "../../common/errors.js";
// @ts-ignore Pure rule-based analysis shared with the PWA.
import { analyzeCycles } from "../../../../shared/cycle/cycle-analysis.js";
// @ts-ignore Shared period lifecycle.
import { resolvePeriods } from "../../../../shared/cycle/period-records.js";
const vietnamToday = () => vietnamDay();
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
    periodEstimates: p.period_estimates || {},
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
  return {
    state: resolvePeriods(state, vietnamDay()) as AppState,
    revision: p.revision as number,
  };
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
  const today = vietnamDay();
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
  state = resolvePeriods(state, vietnamDay());
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
      `UPDATE profiles SET name=$2,share_cycle=$3,share_mood=$4,share_notes=$5,
       share_symptoms=$6,period_estimates=$7::jsonb,symptom_suggestions=$8::jsonb,
       revision=revision+1,updated_at=now() WHERE user_id=$1`,
      [
        userId,
        state.name,
        state.privacy.cycle,
        state.privacy.mood,
        state.privacy.notes,
        state.privacy.symptoms,
        JSON.stringify(state.periodEstimates || {}),
        JSON.stringify(state.symptomSuggestions),
      ],
    );
    // Two statements per collection, independent of history size. Retain unchanged rows.
    await q.query(
      "DELETE FROM cycles WHERE user_id=$1 AND NOT(start_date=ANY($2::date[]))",
      [userId, state.starts],
    );
    await q.query(
      `INSERT INTO cycles(user_id,start_date,end_date)
       SELECT $1,x.start,x."end" FROM jsonb_to_recordset($2::jsonb) AS x(start date,"end" date)
       ON CONFLICT(user_id,start_date) DO UPDATE SET end_date=excluded.end_date
       WHERE cycles.end_date IS DISTINCT FROM excluded.end_date`,
      [
        userId,
        JSON.stringify(
          state.starts.map((start) => ({
            start,
            end: state.ends[start] || null,
          })),
        ),
      ],
    );
    await q.query(
      "DELETE FROM journal_entries WHERE user_id=$1 AND NOT(entry_date=ANY($2::date[]))",
      [userId, Object.keys(state.entries)],
    );
    await q.query(
      `INSERT INTO journal_entries(user_id,entry_date,mood,symptoms,note,shared)
       SELECT $1,x.date,x.mood,x.symptoms,x.note,x.shared
       FROM jsonb_to_recordset($2::jsonb) AS x(date date,mood text,symptoms jsonb,note text,shared boolean)
       ON CONFLICT(user_id,entry_date) DO UPDATE SET mood=excluded.mood,symptoms=excluded.symptoms,note=excluded.note,shared=excluded.shared
       WHERE (journal_entries.mood,journal_entries.symptoms,journal_entries.note,journal_entries.shared)
         IS DISTINCT FROM (excluded.mood,excluded.symptoms,excluded.note,excluded.shared)`,
      [
        userId,
        JSON.stringify(
          Object.entries(state.entries).map(([date, entry]) => ({
            date,
            ...entry,
          })),
        ),
      ],
    );
    await q.query(
      "DELETE FROM cycle_forecasts WHERE user_id=$1 AND NOT(anchor_date=ANY($2::date[]))",
      [userId, state.starts],
    );
    await ensureForecast(q, userId, state);
    const saved = await readState(q, userId);
    return { revision: revision + 1, forecasts: saved.state.forecasts };
  });
}
