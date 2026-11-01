import { analyzeCycles } from "./cycle-analysis.js";

export const HISTORY_RANGES = [
  { key: "3m", label: "3 tháng", months: 3 },
  { key: "6m", label: "6 tháng", months: 6 },
  { key: "1y", label: "1 năm", months: 12 },
  { key: "2y", label: "2 năm", months: 24 },
  { key: "all", label: "Toàn bộ", months: null },
];

export function historyRange(today, key = "3m") {
  const range =
    HISTORY_RANGES.find((item) => item.key === key) || HISTORY_RANGES[0];
  if (range.months === null)
    return { ...range, start: "1900-01-01", end: today };
  const [year, month, day] = today.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 - range.months, 1, 12));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return { ...range, start: target.toISOString().slice(0, 10), end: today };
}

// Describe recorded observations only. Defaults and estimated ends are not evidence.
export function analyzeHistory(state, today, rangeKey = "3m") {
  const range = historyRange(today, rangeKey);
  const current = analyzeCycles(state, today);
  const analysis = analyzeCycles(
    {
      ...state,
      starts: (state.starts || []).filter((start) => start >= range.start),
    },
    today,
    { limit: null },
  );
  // Range statistics use all confirmed observations; forecasts retain their
  // existing recent-history model and never change when switching this filter.
  analysis.lastPeriodStart = current.lastPeriodStart;
  analysis.nextPeriodStart = current.nextPeriodStart;
  analysis.nextPeriodEnd = current.nextPeriodEnd;
  if (!analysis.cycles.length) analysis.averageCycleLength = null;
  if (!analysis.completed.length) analysis.averagePeriodLength = null;
  const highlights = [];
  const changes = [];
  const missing = [];
  const { cycles, completed, starts } = analysis;
  const describe = (rows, label) => {
    const values = rows.map((row) => row.value);
    const average = Math.round(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    );
    return `${label}: ${rows.length} mẫu trong khoảng đang xem, trung bình ${average} ngày, từ ${Math.min(...values)} đến ${Math.max(...values)} ngày.`;
  };
  if (cycles.length) highlights.push(describe(cycles, "Độ dài chu kỳ"));
  if (completed.length)
    highlights.push(describe(completed, "Thời gian hành kinh đã xác nhận"));
  if (!starts.length)
    missing.push(
      "Chưa có ngày bắt đầu kỳ kinh trong khoảng đang xem. Em có thể chọn khoảng rộng hơn hoặc ghi nhận trên lịch.",
    );
  else if (!cycles.length)
    missing.push(
      "Cần ít nhất hai ngày bắt đầu kỳ khác nhau để tính được một khoảng chu kỳ thực tế.",
    );
  if (!completed.length)
    missing.push(
      "Chưa có kỳ kinh được xác nhận ngày kết thúc. Số ngày mặc định và ngày kết thúc tự đặt không được dùng trong báo cáo này.",
    );
  if (cycles.length && cycles.length < 3)
    missing.push(
      "Hiện có dưới ba khoảng chu kỳ; cần thêm lịch sử để mô tả sự thay đổi qua nhiều kỳ.",
    );

  if (cycles.length >= 2) {
    const last = cycles.at(-1).value;
    const previous = cycles.at(-2).value;
    const difference = last - previous;
    changes.push(
      difference === 0
        ? `Chu kỳ hoàn tất gần nhất dài ${last} ngày, bằng chu kỳ ngay trước đó.`
        : `Chu kỳ hoàn tất gần nhất dài ${last} ngày, ${difference > 0 ? "dài" : "ngắn"} hơn chu kỳ ngay trước đó ${Math.abs(difference)} ngày.`,
    );
  }
  if (completed.length >= 2) {
    const last = completed.at(-1).value;
    const previous = completed.at(-2).value;
    changes.push(
      `Kỳ hành kinh đã xác nhận gần nhất kéo dài ${last} ngày; kỳ đã xác nhận trước đó là ${previous} ngày.`,
    );
  }

  const estimated = starts.filter(
    (start) => state.periodEstimates?.[start] && state.ends?.[start],
  ).length;
  const ongoing = starts.filter((start) => !state.ends?.[start]).length;
  if (estimated)
    missing.push(
      `${estimated} kỳ có ngày kết thúc theo ước tính, chưa dùng để tính thời gian hành kinh thực tế. Em có thể chỉnh sửa để xác nhận.`,
    );
  if (ongoing) missing.push(`${ongoing} kỳ chưa ghi nhận ngày kết thúc.`);

  const entries = Object.entries(state.entries || {}).filter(
    ([day, entry]) =>
      day >= range.start &&
      day <= today &&
      entry &&
      (entry.mood || entry.symptoms?.length || entry.note?.trim()),
  );
  const journalStart =
    range.key === "all"
      ? [...starts, ...entries.map(([day]) => day)].sort()[0] || null
      : range.start;
  const counts = new Map();
  for (const [, entry] of entries) {
    for (const symptom of new Set(
      (entry.symptoms || []).map((value) => value.trim()).filter(Boolean),
    )) {
      counts.set(symptom, (counts.get(symptom) || 0) + 1);
    }
  }
  const symptoms = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi"))
    .slice(0, 3)
    .map(([name, days]) => ({ name, days }));
  if (!entries.length)
    missing.push(
      "Chưa có nhật ký trong khoảng đang xem để tổng hợp biểu hiện cơ thể.",
    );
  else if (entries.length && !symptoms.length)
    missing.push(
      "Các ngày có nhật ký chưa ghi triệu chứng; chưa thể mô tả biểu hiện thường gặp.",
    );
  if (!changes.length)
    changes.push("Chưa đủ hai mẫu cùng loại để so sánh với lần trước.");
  return {
    highlights,
    changes,
    missing,
    symptoms,
    journalStart,
    journalDays: entries.length,
    range,
    analysis,
  };
}
