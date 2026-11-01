import { analyzeCycles } from "./cycle-analysis.js";

// Describe recorded observations only. Defaults and estimated ends are not evidence.
export function analyzeHistory(state, today) {
  const analysis = analyzeCycles(state, today);
  const highlights = [];
  const changes = [];
  const missing = [];
  const { cycles, completed, starts } = analysis;
  const describe = (rows, label) => {
    const values = rows.map((row) => row.value);
    const average = Math.round(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    );
    return `${label}: ${rows.length} mẫu gần nhất, trung bình ${average} ngày, từ ${Math.min(...values)} đến ${Math.max(...values)} ngày.`;
  };
  if (cycles.length) highlights.push(describe(cycles, "Độ dài chu kỳ"));
  if (completed.length)
    highlights.push(describe(completed, "Thời gian hành kinh đã xác nhận"));
  if (!starts.length)
    missing.push(
      "Chưa có ngày bắt đầu kỳ kinh. Em có thể ghi nhận trên lịch để bắt đầu theo dõi.",
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

  const journalStart = starts.slice(-7)[0] || null;
  const entries = journalStart
    ? Object.entries(state.entries || {}).filter(
        ([day, entry]) =>
          day >= journalStart &&
          day <= today &&
          entry &&
          (entry.mood || entry.symptoms?.length || entry.note?.trim()),
      )
    : [];
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
  if (starts.length && !entries.length)
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
  };
}
