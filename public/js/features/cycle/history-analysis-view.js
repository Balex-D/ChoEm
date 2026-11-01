import { analyzeHistory } from "/shared/cycle/history-analysis.js";

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

export function createHistoryAnalysis(state, today, { expanded = false } = {}) {
  const section = document.createElement("section");
  section.className = "card history-analysis";
  section.innerHTML = `<div class="history-analysis-heading"><div><h2>Hiểu nhịp điệu của Em</h2><p>Nhìn lại những kỳ kinh và biểu hiện đã ghi nhận.</p></div><button class="small-button" type="button" aria-expanded="false" aria-controls="history-analysis-result">Phân tích lịch sử</button></div><div id="history-analysis-result" hidden></div>`;
  const button = section.querySelector("button");
  const result = section.querySelector("#history-analysis-result");
  button.onclick = () => {
    const opening = result.hidden;
    if (opening) {
      const report = analyzeHistory(state, today);
      const list = (title, items) =>
        `<div class="history-analysis-group"><h3>${title}</h3><ul>${items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul></div>`;
      result.innerHTML = `<p class="history-analysis-basis">Thống kê từ lịch sử đã ghi nhận · Tối đa 6 khoảng chu kỳ và 6 kỳ hành kinh đã xác nhận gần nhất.</p>${list("Số liệu nổi bật", report.highlights.length ? report.highlights : ["Chưa đủ dữ liệu thực tế để tổng hợp số ngày."])}${list("Thay đổi gần đây", report.changes)}${
        report.symptoms.length
          ? list(
              "Biểu hiện được ghi nhận nhiều nhất",
              report.symptoms.map(
                ({ name, days }) =>
                  `${name}: ghi nhận trong ${days}/${report.journalDays} ngày có nhật ký.`,
              ),
            )
          : ""
      }${report.missing.length ? list("Dữ liệu còn thiếu", report.missing) : ""}<p class="history-analysis-basis">${report.journalDays ? `Nhật ký từ ${escape(report.journalStart.split("-").reverse().join("/"))} đến ${escape(today.split("-").reverse().join("/"))}. ` : ""}Ngày bỏ trống không được coi là ngày không có triệu chứng. Nhận xét mô tả lịch sử, không xác định nguyên nhân hay chẩn đoán sức khỏe.</p>`;
    }
    result.hidden = !opening;
    button.setAttribute("aria-expanded", String(opening));
    button.textContent = opening ? "Thu gọn phân tích" : "Phân tích lịch sử";
  };
  if (expanded) button.click();
  return section;
}
