import type { AppState } from "../sync/schema.js";
// @ts-ignore Pure calendar model shared with the PWA; same relative path after compilation.
import { calendarMonth } from "../../../../dist/js/cycle-model.js";
// @ts-ignore Shared deterministic analysis, never manual profile settings.
import { analyzeCycles } from "../../../../dist/js/cycle-analysis.js";
export function sharedSummary(state: AppState, today: string) {
  // Return only explicitly allowed fields; do not return the complete snapshot to a companion.
  const shared: Record<string, unknown> = { name: state.name };
  if (state.privacy.cycle) {
    const start = state.starts
      .filter((x) => x <= today)
      .sort()
      .at(-1);
    if (start) {
      const elapsed = Math.round(
        (Date.parse(today + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) /
          86400000,
      );
      const analysis = analyzeCycles(state, today);
      shared.cycle = {
        day: elapsed + 1,
        inPeriod: !state.ends[start],
        nextDate: analysis.nextPeriodStart,
        estimated: true,
      };
    } else shared.cycle = null;
  }
  const entry = state.entries[today];
  if (state.privacy.mood) shared.mood = entry?.mood || "";
  if (entry?.shared) {
    shared.note = entry?.note || "";
  }
  if (state.privacy.symptoms) shared.symptoms = entry?.symptoms || [];
  shared.care =
    "Hỏi người ấy cần gì, ở bên và lắng nghe. Đừng suy đoán cảm xúc chỉ dựa vào chu kỳ.";
  return shared;
}
export function sharedDetails(state: AppState, today: string, month: string) {
  const result: Record<string, unknown> = { name: state.name, month };
  if (state.privacy.cycle) {
    result.calendar = calendarMonth(state, month, today);
    const analysis = analyzeCycles(state, today);
    result.analysis = {
      averageCycleLength: analysis.averageCycleLength,
      averagePeriodLength: analysis.averagePeriodLength,
      lastPeriodStart: analysis.lastPeriodStart,
      nextPeriodStart: analysis.nextPeriodStart,
      nextPeriodEnd: analysis.nextPeriodEnd,
      cycleNotice: analysis.cycleNotice,
      periodNotice: analysis.periodNotice,
    };
  }
  const entries = Object.entries(state.entries).filter(
    ([date]) => date.startsWith(month + "-") && date <= today,
  );
  if (state.privacy.mood)
    result.moods = Object.fromEntries(
      entries.map(([date, entry]) => [date, entry.mood]),
    );
  if (state.privacy.symptoms)
    result.symptoms = Object.fromEntries(
      entries.map(([date, entry]) => [date, entry.symptoms]),
    );
  if (
    state.privacy.notes ||
    Object.values(state.entries).some((entry) => entry.shared)
  )
    result.journal = entries
      .filter(([, entry]) => entry.shared)
      .map(([date, entry]) => ({
        date,
        note: entry.note,
        ...(state.privacy.mood ? { mood: entry.mood } : {}),
        ...(state.privacy.symptoms ? { symptoms: entry.symptoms } : {}),
      }));
  return result;
}
