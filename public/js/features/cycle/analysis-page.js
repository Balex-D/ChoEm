import { analyzeCycles } from "/shared/cycle/cycle-analysis.js";
import {
  renderCycleOverview,
  renderCycleNotices,
  renderCycleCharts,
} from "./cycle-analysis-view.js";
import { createHistoryAnalysis } from "./history-analysis-view.js";

export function renderAnalysisPage({ main, state, today }) {
  const analysis = analyzeCycles(state, today);
  main.innerHTML = `<div class="page-intro"><div class="eyebrow">NHÌN LẠI ĐỂ HIỂU MÌNH HƠN</div><h1>Phân tích chu kỳ</h1><p>Số liệu, thay đổi gần đây và những điều Em đã ghi nhận.</p></div>${renderCycleOverview(analysis)}${renderCycleNotices(analysis)}<div id="history-analysis-slot"></div>${renderCycleCharts(analysis)}<p class="privacy-note">Dự đoán và nhận xét chỉ mang tính tham khảo, không dùng làm biện pháp tránh thai hay chẩn đoán sức khỏe.</p>`;
  main
    .querySelector("#history-analysis-slot")
    .replaceWith(createHistoryAnalysis(state, today, { expanded: true }));
}
