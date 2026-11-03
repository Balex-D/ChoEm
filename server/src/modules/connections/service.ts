import type { AppState } from "../sync/schema.js";
// @ts-ignore Pure calendar model shared with the PWA; same relative path after compilation.
import { calendarMonth } from "../../../../shared/cycle/cycle-model.js";
// @ts-ignore Shared deterministic analysis, never manual profile settings.
import * as cycleAnalysis from "../../../../shared/cycle/cycle-analysis.js";
const { analyzeCycles, daysBetween } = cycleAnalysis;
export function sharedSummary(state: AppState, today: string) {
  // Return only explicitly allowed fields; do not return the complete snapshot to a companion.
  const shared: Record<string, unknown> = { name: state.name };
  if (state.privacy.paused) return { ...shared, paused: true };
  if (state.privacy.intimacy)
    shared.intimacy = (state.intimacyDates || []).includes(today);
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
        inPeriod: !state.ends[start] || today <= state.ends[start],
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
  if (state.privacy.symptoms) {
    shared.pain = entry?.pain ?? null;
    shared.flow = entry?.flow || "";
  }
  if (entry?.needsShared && entry.needs?.length) shared.needs = entry.needs;
  if (entry?.needsShared && entry.needsText?.trim())
    shared.needsText = entry.needsText;
  shared.care =
    "Hỏi người ấy cần gì, ở bên và lắng nghe. Đừng suy đoán cảm xúc chỉ dựa vào chu kỳ.";
  return shared;
}
export function sharedDetails(
  state: AppState,
  today: string,
  month: string,
  revision = 0,
) {
  const result: Record<string, unknown> = { name: state.name, month };
  if (state.privacy.paused) return { ...result, paused: true };
  if (state.privacy.intimacy)
    result.intimacy = {
      dates: (state.intimacyDates || []).filter(
        (date) => date.startsWith(month + "-") && date <= today,
      ),
      canEdit: Boolean(state.privacy.intimacyEdit),
      revision,
    };
  if (state.privacy.cycle) {
    result.calendar = calendarMonth(state, month, today);
    const analysis = analyzeCycles(state, today);
    const latest = analysis.lastPeriodStart;
    result.cycle = latest
      ? {
          day: daysBetween(latest, today) + 1,
          inPeriod: !state.ends[latest] || today <= state.ends[latest],
          periodLength: state.ends[latest]
            ? daysBetween(latest, state.ends[latest]) + 1
            : null,
          estimatedEnd: Boolean(state.periodEstimates?.[latest]),
        }
      : null;
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
  if (state.privacy.symptoms) {
    result.body = Object.fromEntries(
      entries.map(([date, entry]) => [
        date,
        { pain: entry.pain ?? null, flow: entry.flow || "" },
      ]),
    );
  }
  const todayEntry = state.entries[today];
  if (
    today.startsWith(month + "-") &&
    todayEntry?.needsShared &&
    todayEntry.needs?.length
  )
    result.needs = { [today]: todayEntry.needs };
  if (
    today.startsWith(month + "-") &&
    todayEntry?.needsShared &&
    todayEntry.needsText?.trim()
  )
    result.needsText = { [today]: todayEntry.needsText };
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
