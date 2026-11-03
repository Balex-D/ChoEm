import { vietnamDay } from "./dates.js";
import { checkinEntry } from "./checkin.js";
const moods = new Set([
  "",
  "Vui vẻ",
  "Yêu đời",
  "Mệt mỏi",
  "Buồn chút",
  "Cáu kỉnh",
  "Nhạy cảm",
]);
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const day = (v) =>
  typeof v === "string" &&
  /^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + "T12:00:00Z")) &&
  new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
const strings = (v, count) =>
  Array.isArray(v) &&
  v.length <= count &&
  v.every(
    (x) =>
      typeof x === "string" && x.trim().length > 0 && x.trim().length <= 60,
  );
const fail = () => {
  throw new Error(
    "Bản sao không hợp lệ hoặc vượt giới hạn dữ liệu. Hãy chọn file JSON đã xuất từ Cho Em.",
  );
};

export function parseBackup(text, today = vietnamDay()) {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) fail();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    fail();
  }
  const s = payload?.state;
  if (
    !object(s) ||
    typeof s.name !== "string" ||
    !s.name.trim() ||
    s.name.trim().length > 24 ||
    !Array.isArray(s.starts) ||
    s.starts.length > 1000 ||
    new Set(s.starts).size !== s.starts.length ||
    !s.starts.every((x) => day(x) && x <= today) ||
    !object(s.ends) ||
    !object(s.entries) ||
    Object.keys(s.entries).length > 10000 ||
    Object.keys(s.ends).length > 1000
  )
    fail();
  const starts = [...s.starts].sort(),
    ends = {},
    estimates = s.periodEstimates ?? {};
  if (
    s.intimacyDates !== undefined &&
    (!Array.isArray(s.intimacyDates) ||
      s.intimacyDates.length > 10000 ||
      new Set(s.intimacyDates).size !== s.intimacyDates.length ||
      !s.intimacyDates.every((date) => day(date) && date <= today))
  )
    fail();
  if (!object(estimates) || Object.keys(estimates).length > 1000) fail();
  for (const [start, duration] of Object.entries(estimates)) {
    if (
      !starts.includes(start) ||
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > 1000
    )
      fail();
    const expected = new Date(
      Date.parse(start + "T12:00:00Z") + (duration - 1) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
    const next = starts[starts.indexOf(start) + 1];
    if (
      (next && expected >= next) ||
      (s.ends[start] && s.ends[start] !== expected)
    )
      fail();
  }
  for (const [start, end] of Object.entries(s.ends)) {
    const next = starts[starts.indexOf(start) + 1];
    if (
      !starts.includes(start) ||
      !day(end) ||
      end < start ||
      (end > today && !estimates[start]) ||
      (next && end >= next)
    )
      fail();
    ends[start] = end;
  }
  const entries = Object.fromEntries(
    Object.entries(s.entries).map(([date, e]) => {
      if (
        !day(date) ||
        !object(e) ||
        !moods.has(e.mood ?? "") ||
        !strings(e.symptoms ?? [], 50) ||
        typeof (e.note ?? "") !== "string" ||
        (e.note ?? "").length > 2000 ||
        (e.shared !== undefined && typeof e.shared !== "boolean") ||
        (e.needsShared !== undefined && typeof e.needsShared !== "boolean") ||
        (e.needsText !== undefined && typeof e.needsText !== "string") ||
        (e.pain != null && typeof e.pain !== "number")
      )
        fail();
      return [date, checkinEntry({ ...e, shared: false, needsShared: false })];
    }),
  );
  if (
    !strings(
      s.symptomSuggestions ?? ["Đau bụng", "Đau lưng", "Đau đầu", "Căng ngực"],
      50,
    )
  )
    fail();
  return {
    state: {
      name: s.name.trim(),
      starts,
      ends,
      ...(s.intimacyDates === undefined
        ? {}
        : { intimacyDates: [...s.intimacyDates].sort() }),
      periodEstimates: { ...estimates },
      entries,
      symptomSuggestions: s.symptomSuggestions ?? [
        "Đau bụng",
        "Đau lưng",
        "Đau đầu",
        "Căng ngực",
      ],
      forecasts: [],
      privacy: { cycle: false, mood: false, notes: false, symptoms: false },
    },
    summary: {
      periods: starts.length,
      entries: Object.keys(entries).length,
      intimacy: s.intimacyDates?.length,
    },
  };
}
