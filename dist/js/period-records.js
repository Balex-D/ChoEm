import { analyzeCycles } from "./cycle-analysis.js";
const stamp = (day) => Date.parse(day + "T12:00:00Z");
export const addPeriodDays = (day, amount) =>
  new Date(stamp(day) + amount * 86400000).toISOString().slice(0, 10);
export const periodDayCount = (start, end) =>
  Math.round((stamp(end) - stamp(start)) / 86400000) + 1;
function validate(day, today) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(stamp(day)) ||
    new Date(stamp(day)).toISOString().slice(0, 10) !== day ||
    day < "1900-01-01" ||
    day > today
  )
    throw new Error("Chỉ ghi nhận ngày đã diễn ra, từ năm 1900 đến hôm nay.");
}
// Estimates remain separate from confirmed ends, including after automatic closure.
export function resolvePeriods(state, today) {
  const ends = { ...state.ends };
  for (const [start, duration] of Object.entries(state.periodEstimates || {})) {
    if (!state.starts.includes(start)) continue;
    const expected = addPeriodDays(start, duration - 1);
    if (periodDayCount(start, today) > 7 || expected < today) {
      // A current recording stays open through day seven; historical recordings
      // already have their estimated end set by beginPeriod.
      if (periodDayCount(start, today) > 7 || ends[start])
        ends[start] = expected;
    }
  }
  return { ...state, ends };
}
export function periodIntervals(state, today) {
  state = resolvePeriods(state, today);
  const starts = [...state.starts].sort();
  return starts.map((start, i) => ({
    start,
    end: state.ends[start] || (starts[i + 1] ? start : today),
    ongoing: !state.ends[start] && i === starts.length - 1,
  }));
}
export function ongoingPeriod(state, today) {
  return periodIntervals(state, today).find((period) => period.ongoing) || null;
}
export function periodContaining(state, day, today) {
  return (
    periodIntervals(state, today).find(
      (period) => period.start <= day && period.end >= day,
    ) || null
  );
}
export function recordPeriodDragRange(
  state,
  from,
  to,
  today,
  editStart = null,
) {
  validate(from, today);
  validate(to, today);
  if (editStart && state.starts.includes(editStart) && to === editStart)
    return removePeriod(state, editStart);
  return recordPeriodRange(state, from, to, today, editStart);
}
export function recordPeriodRange(state, from, to, today, editStart = null) {
  validate(from, today);
  validate(to, today);
  const edited =
    editStart && state.starts.includes(editStart) ? editStart : null;
  let [start, end] = [edited || from, to].sort();
  let ongoing = false;
  const removed = new Set(edited ? [edited] : []);
  const records = periodIntervals(state, today);
  let changed;
  do {
    changed = false;
    for (const period of records) {
      if (
        removed.has(period.start) ||
        addPeriodDays(period.end, 1) < start ||
        addPeriodDays(end, 1) < period.start
      )
        continue;
      removed.add(period.start);
      start = [start, period.start].sort()[0];
      end = [end, period.end].sort().at(-1);
      ongoing ||= period.ongoing;
      changed = true;
    }
  } while (changed);
  const starts = state.starts.filter((day) => !removed.has(day));
  const ends = { ...state.ends };
  const periodEstimates = { ...state.periodEstimates };
  for (const day of removed) {
    delete ends[day];
    delete periodEstimates[day];
  }
  starts.push(start);
  starts.sort();
  if (!ongoing) ends[start] = end;
  return {
    ...state,
    starts,
    ends,
    ...(state.periodEstimates ? { periodEstimates } : {}),
  };
}
export function beginPeriod(state, start, today) {
  validate(start, today);
  if (periodContaining(state, start, today))
    throw new Error(
      "Ngày này đã nằm trong một kỳ kinh. Em có thể sửa khoảng ngày đó.",
    );
  if (ongoingPeriod(state, today))
    throw new Error(
      "Hãy kết thúc kỳ kinh đang ghi nhận trước khi bắt đầu kỳ mới.",
    );
  const duration = analyzeCycles(state, today).averagePeriodLength;
  const expected = addPeriodDays(start, duration - 1);
  if (state.starts.some((day) => day > start && day <= expected))
    throw new Error("Khoảng ngày dự kiến trùng kỳ kinh khác.");
  const next = {
    ...state,
    starts: [...state.starts, start].sort(),
    ends: { ...state.ends },
    periodEstimates: { ...state.periodEstimates, [start]: duration },
  };
  if (expected < today || periodDayCount(start, today) > 7)
    next.ends[start] = expected;
  return next;
}
export function finishPeriod(state, start, end, today) {
  validate(end, today);
  if (
    !state.starts.includes(start) ||
    end < start ||
    state.starts.some((day) => day > start && day <= end)
  )
    throw new Error("Ngày kết thúc không hợp lệ hoặc trùng kỳ kinh khác.");
  const next = { ...state, ends: { ...state.ends, [start]: end } };
  if (state.periodEstimates) {
    next.periodEstimates = { ...state.periodEstimates };
    delete next.periodEstimates[start];
  }
  return next;
}
export function removePeriod(state, start) {
  const ends = { ...state.ends };
  delete ends[start];
  const periodEstimates = { ...state.periodEstimates };
  delete periodEstimates[start];
  return {
    ...state,
    ...(state.periodEstimates ? { periodEstimates } : {}),
    starts: state.starts.filter((day) => day !== start),
    ends,
  };
}
