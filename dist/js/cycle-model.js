import { analyzeCycles, shiftDay } from "./cycle-analysis.js";
import { periodIntervals } from "./period-records.js";
export function cycleDayType(
  state,
  key,
  today,
  analysis = analyzeCycles(state, today),
) {
  if (
    key <= today &&
    periodIntervals(state, today).some(
      (period) => key >= period.start && key <= period.end,
    )
  )
    return "period";
  if (
    analysis.nextPeriodStart &&
    key >= analysis.nextPeriodStart &&
    key <= analysis.nextPeriodEnd
  )
    return "predicted";
  if (analysis.nextPeriodStart) {
    const ovulation = shiftDay(analysis.nextPeriodStart, -14);
    if (ovulation >= analysis.lastPeriodStart && key === ovulation)
      return "ovulation";
  }
  return "";
}
export function calendarMonth(state, month, today) {
  const [year, number] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const analysis = analyzeCycles(state, today);
  return Array.from({ length: count }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    return { date, type: cycleDayType(state, date, today, analysis) };
  });
}
