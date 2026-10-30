const validDay = (value) =>
  typeof value === "string" &&
  /^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + "T12:00:00Z")) &&
  new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
export const daysBetween = (first, last) =>
  Math.round(
    (Date.parse(last + "T12:00:00Z") - Date.parse(first + "T12:00:00Z")) /
      86400000,
  );
export const shiftDay = (day, amount) =>
  new Date(Date.parse(day + "T12:00:00Z") + amount * 86400000)
    .toISOString()
    .slice(0, 10);
const mean = (values) =>
  values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;

// Only observed starts and explicitly completed periods are statistical evidence.
export function analyzeCycles(state, today) {
  const starts = [...new Set(state.starts || [])]
    .filter((day) => validDay(day) && day <= today)
    .sort();
  const cycles = starts
    .slice(1)
    .map((start, i) => ({
      start: starts[i],
      end: start,
      value: daysBetween(starts[i], start),
    }))
    .filter((item) => item.value > 0)
    .slice(-6);
  const completed = starts
    .map((start, i) => ({
      start,
      end: state.ends?.[start],
      next: starts[i + 1],
    }))
    .filter(
      (item) =>
        validDay(item.end) &&
        item.end >= item.start &&
        item.end <= today &&
        (!item.next || item.end < item.next),
    )
    .map(({ start, end }) => ({
      start,
      end,
      value: daysBetween(start, end) + 1,
    }))
    .slice(-6);
  const averageCycleLength = mean(cycles.map((item) => item.value));
  const averagePeriodLength = mean(completed.map((item) => item.value));
  const lastPeriodStart = starts.at(-1) || null;
  const nextPeriodStart =
    lastPeriodStart &&
    averageCycleLength !== null &&
    averagePeriodLength !== null
      ? shiftDay(lastPeriodStart, averageCycleLength)
      : null;
  const nextPeriodEnd = nextPeriodStart
    ? shiftDay(nextPeriodStart, averagePeriodLength - 1)
    : null;
  const cycleSpread =
    cycles.length >= 3
      ? Math.max(...cycles.map((item) => item.value)) -
        Math.min(...cycles.map((item) => item.value))
      : null;
  const periodSpread =
    completed.length >= 3
      ? Math.max(...completed.map((item) => item.value)) -
        Math.min(...completed.map((item) => item.value))
      : null;
  const cycleNotice =
    cycleSpread === null
      ? null
      : cycleSpread <= 3
        ? "Chu kỳ của Em đang duy trì khá đều đặn."
        : cycleSpread <= 7
          ? "Chu kỳ gần đây có một chút thay đổi so với trước."
          : "Chu kỳ gần đây có sự thay đổi đáng chú ý. Em hãy tiếp tục theo dõi nhé.";
  const periodNotice =
    periodSpread === null
      ? null
      : periodSpread <= 1
        ? "Thời gian hành kinh của Em đang khá ổn định."
        : "Số ngày hành kinh gần đây có một chút thay đổi so với trước.";
  const previousStart = starts.at(-2);
  // Dates alone cannot establish within-day ordering. Require a snapshot saved
  // before the new start day (Vietnam time); never reconstruct old forecasts.
  const evidence = (state.forecasts || []).find(
    (item) =>
      item.anchor === previousStart &&
      validDay(item.start) &&
      Number.isFinite(Date.parse(item.issuedAt)) &&
      Date.parse(item.issuedAt) <
        Date.parse(lastPeriodStart + "T00:00:00+07:00"),
  );
  const difference = evidence
    ? daysBetween(evidence.start, lastPeriodStart)
    : null;
  const timingNotice =
    difference === null
      ? null
      : Math.abs(difference) <= 1
        ? "Kỳ kinh này đến gần ngày dự kiến đã ghi nhận trước đó."
        : difference < 0
          ? `Kỳ kinh này đến sớm hơn dự kiến ${Math.abs(difference)} ngày.`
          : `Kỳ kinh này đến muộn hơn dự kiến ${difference} ngày.`;
  return {
    starts,
    cycles,
    completed,
    averageCycleLength,
    averagePeriodLength,
    lastPeriodStart,
    nextPeriodStart,
    nextPeriodEnd,
    cycleNotice,
    periodNotice,
    timingNotice,
  };
}
export function recordLocalForecast(
  state,
  today,
  issuedAt = new Date().toISOString(),
) {
  const analysis = analyzeCycles(state, today);
  const forecasts = (state.forecasts || []).filter((item) =>
    analysis.starts.includes(item.anchor),
  );
  if (!analysis.nextPeriodStart) return { ...state, forecasts };
  const candidate = {
    anchor: analysis.lastPeriodStart,
    start: analysis.nextPeriodStart,
    end: analysis.nextPeriodEnd,
    issuedAt,
  };
  const previous = forecasts.find((item) => item.anchor === candidate.anchor);
  if (
    previous &&
    previous.start === candidate.start &&
    previous.end === candidate.end
  )
    return { ...state, forecasts };
  return {
    ...state,
    forecasts: [
      ...forecasts.filter((item) => item.anchor !== candidate.anchor),
      candidate,
    ].slice(-1000),
  };
}
