import {
  renderCycleOverview,
  renderCycleNotices,
} from "./cycle-analysis-view.js";
export function renderSharedDetails(s, selected, escape) {
  if (!["calendar", "moods", "symptoms", "journal"].some((key) => key in s))
    return '<p class="shared-empty">Em chưa bật chia sẻ thông tin.</p>';
  const [year, month] = s.month.split("-").map(Number);
  const offset = (new Date(year, month - 1, 1, 12).getDay() + 6) % 7;
  const calendar =
    "calendar" in s
      ? `<section class="calendar-card shared-calendar"><h3>Lịch của Em</h3><div class="week">${["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => `<span>${d}</span>`).join("")}</div><div class="days">${"<span></span>".repeat(offset)}${s.calendar.map((day) => `<button class="day ${day.type} ${day.date === selected ? "selected" : ""}" data-shared-day="${day.date}" aria-label="${day.date}">${Number(day.date.slice(-2))}</button>`).join("")}</div><div class="calendar-legend"><span><i class="dot"></i>Ngày kinh</span><span><i class="dot dashed"></i>Kỳ kinh dự kiến</span><span><i class="dot purple"></i>Rụng trứng dự kiến</span></div><p class="shared-estimate">Ngày dự kiến chỉ là ước tính.</p></section>`
      : "";
  return `<label class="form-label" for="shared-month">Tháng muốn xem</label><input type="month" id="shared-month" value="${s.month}" min="1900-01" max="2199-12">${s.analysis ? renderCycleOverview(s.analysis) + renderCycleNotices(s.analysis) : ""}${calendar}${"moods" in s || "symptoms" in s ? `<label class="form-label" for="shared-date-picker">Ngày muốn xem</label><input type="date" id="shared-date-picker" value="${selected}" min="${s.month}-01" max="${s.month}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}">` : ""}${"moods" in s ? `<section class="shared-detail"><h3>Tâm trạng</h3><p>${escape(s.moods[selected] || "Chưa ghi nhận")}</p></section>` : ""}${"symptoms" in s ? `<section class="shared-detail"><h3>Triệu chứng</h3><p>${escape((s.symptoms[selected] || []).join(", ") || "Chưa ghi nhận")}</p></section>` : ""}${
    "journal" in s
      ? `<section class="shared-detail"><h3>Nhật ký Em chia sẻ</h3>${
          s.journal.length
            ? [...s.journal]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map(
                  (entry) =>
                    `<article class="shared-journal"><b>${escape(entry.date)}</b><p>${escape(entry.note || "Chưa có ghi chú")}</p>${"mood" in entry ? `<p>${escape(entry.mood)}</p>` : ""}${"symptoms" in entry ? `<p>${escape(entry.symptoms.join(", "))}</p>` : ""}</article>`,
                )
                .join("")
            : "<p>Chưa có nhật ký được chia sẻ trong tháng này.</p>"
        }</section>`
      : ""
  }`;
}
