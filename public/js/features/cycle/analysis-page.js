import {
  analyzeHistory,
  HISTORY_RANGES,
} from "/shared/cycle/history-analysis.js";
import {
  renderCycleOverview,
  renderCycleNotices,
  renderCycleCharts,
} from "./cycle-analysis-view.js";
import { createHistoryAnalysis } from "./history-analysis-view.js";

export function renderAnalysisPage({
  main,
  state,
  today,
  range = "3m",
  onRangeChange = () => {},
}) {
  const report = analyzeHistory(state, today, range);
  const analysis = report.analysis;
  main.innerHTML = `<div class="page-intro"><div class="eyebrow">NHÌN LẠI ĐỂ HIỂU MÌNH HƠN</div><h1>Phân tích chu kỳ</h1><p>Số liệu, thay đổi gần đây và những điều Em đã ghi nhận.</p></div><section class="card analysis-range"><label for="analysis-range">Khoảng thống kê</label><select id="analysis-range">${HISTORY_RANGES.map((item) => `<option value="${item.key}" ${item.key === report.range.key ? "selected" : ""}>${item.label}</option>`).join("")}</select><p>${report.range.key === "all" ? "Toàn bộ lịch sử đã ghi nhận" : `Từ ${report.range.start.split("-").reverse().join("/")}`} đến ${today.split("-").reverse().join("/")}. Kỳ tiếp theo vẫn được dự kiến từ lịch sử gần nhất.</p></section>${renderCycleOverview(analysis)}${renderCycleNotices(analysis, { rangeScoped: true })}<div id="history-analysis-slot"></div>${renderCycleCharts(analysis, { rangeLabel: report.range.label })}<p class="privacy-note">Dự đoán và nhận xét chỉ mang tính tham khảo, không dùng làm biện pháp tránh thai hay chẩn đoán sức khỏe.</p>`;
  main
    .querySelector("#history-analysis-slot")
    .replaceWith(
      createHistoryAnalysis(state, today, {
        expanded: true,
        range: report.range.key,
      }),
    );
  main.querySelector("#analysis-range").onchange = (event) => {
    const nextRange = event.target.value;
    onRangeChange(nextRange);
    renderAnalysisPage({ main, state, today, range: nextRange, onRangeChange });
    main.querySelector("#analysis-range").focus({ preventScroll: true });
  };
}
