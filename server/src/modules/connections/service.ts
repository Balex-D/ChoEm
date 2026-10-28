import type { AppState } from "../sync/schema.js";
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
      const next = new Date(
        Date.parse(start + "T12:00:00Z") + state.length * 86400000,
      )
        .toISOString()
        .slice(0, 10);
      shared.cycle = {
        day: elapsed + 1,
        inPeriod: !state.ends[start] && elapsed < state.duration,
        nextDate: next,
        estimated: true,
      };
    } else shared.cycle = null;
  }
  const entry = state.entries[today];
  if (state.privacy.mood) shared.mood = entry?.mood || "";
  if (state.privacy.notes) {
    shared.note = entry?.note || "";
    shared.symptoms = entry?.symptoms || [];
  }
  shared.care =
    "Hỏi người ấy cần gì, ở bên và lắng nghe. Đừng suy đoán cảm xúc chỉ dựa vào chu kỳ.";
  return shared;
}
