import {
  renderCycleOverview,
  renderCycleNotices,
} from "../cycle/cycle-analysis-view.js";
import { FLOW_LABELS, NEED_LABELS } from "/shared/checkin.js";

export function hasSharedContent(shared, date) {
  return Boolean(
    shared.moods?.[date]?.trim() ||
    shared.symptoms?.[date]?.length ||
    shared.journal?.some(
      (entry) => entry.date === date && entry.note?.trim(),
    ) ||
    shared.body?.[date]?.pain != null ||
    shared.body?.[date]?.flow ||
    shared.needs?.[date]?.length ||
    shared.needsText?.[date]?.trim(),
  );
}

export function renderSharedDetails(
  s,
  selected,
  escape,
  { tab = "calendar", today = "" } = {},
) {
  if (s.paused)
    return '<p class="shared-empty" role="status">Em đang tạm dừng chia sẻ dữ liệu cá nhân.</p>';
  const allowed = [
    "calendar",
    "moods",
    "symptoms",
    "journal",
    "body",
    "needs",
    "needsText",
    "intimacy",
  ].some((key) => key in s);
  const dateLabel = (date) =>
    new Date(date + "T12:00:00").toLocaleDateString("vi-VN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const [year, month] = s.month.split("-").map(Number);
  const offset = (new Date(year, month - 1, 1, 12).getDay() + 6) % 7;
  const count = new Date(year, month, 0).getDate();
  const days =
    s.calendar ||
    Array.from({ length: count }, (_, i) => ({
      date: `${s.month}-${String(i + 1).padStart(2, "0")}`,
      type: "",
    }));
  const cycle = s.cycle;
  const status = cycle
    ? `<p class="shared-cycle-status">Ngày thứ ${Number(cycle.day)} của chu kỳ · ${cycle.inPeriod ? `Đang ghi nhận hành kinh ngày thứ ${Number(cycle.day)}` : cycle.periodLength ? `Kỳ gần nhất kéo dài ${Number(cycle.periodLength)} ngày${cycle.estimatedEnd ? " (ước tính, chưa xác nhận)" : ""}` : "Chưa có ngày kết thúc kỳ gần nhất"}.</p>`
    : "";
  const heading = `<div class="calendar-heading"><h3><button type="button" class="calendar-jump" data-shared-jump="month" aria-label="Chọn tháng">Tháng ${month}</button>, <button type="button" class="calendar-jump" data-shared-jump="year" aria-label="Chọn năm">${year}</button></h3><div class="month-control"><button type="button" data-shared-month-step="-1" aria-label="Tháng trước" ${s.month === "1900-01" ? "disabled" : ""}>‹</button><button type="button" data-shared-month-step="1" aria-label="Tháng sau" ${s.month === "2199-12" ? "disabled" : ""}>›</button></div></div>`;
  const calendar = `<section class="calendar-card shared-calendar" aria-label="Lịch chia sẻ của Em">${heading}<div class="week">${["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => `<span>${day}</span>`).join("")}</div><div class="days">${"<span></span>".repeat(offset)}${days
    .map((day) => {
      const marked = hasSharedContent(s, day.date);
      return `<button type="button" class="day ${escape(day.type)} ${day.date === selected ? "selected" : ""} ${day.date === today ? "today" : ""} ${marked ? "has-shared-content" : ""}" data-shared-day="${day.date}" aria-label="${escape(dateLabel(day.date))}${marked ? ", có nội dung Em chia sẻ" : ""}">${Number(day.date.slice(-2))}${s.intimacy?.dates.includes(day.date) ? '<span class="intimacy-marker" aria-hidden="true">&#9825;</span>' : ""}</button>`;
    })
    .join(
      "",
    )}</div>${s.calendar ? '<div class="calendar-legend"><span><i class="dot"></i>Ngày kinh</span><span><i class="dot dashed"></i>Kỳ kinh dự kiến</span><span><i class="dot purple"></i>Rụng trứng dự kiến</span></div>' : ""}<p class="shared-estimate">Chấm trên ngày đánh dấu cảm xúc, triệu chứng hoặc nhật ký Em đã chia sẻ.${s.calendar ? " Ngày dự kiến chỉ là ước tính." : ""}</p></section>`;
  const entry = s.journal?.find((item) => item.date === selected);
  const body = s.body?.[selected];
  const intimacyDates = s.intimacy?.dates || [];
  const intimacy = s.intimacy
    ? `<section class="shared-detail intimacy-controls"><h3>Ngày gần gũi của hai người</h3><p>${intimacyDates.includes(selected) ? "Đã ghi nhận quan hệ trong ngày này." : "Chưa ghi nhận quan hệ trong ngày này."}</p>${s.intimacy.canEdit ? `<button type="button" class="small-button" data-intimacy-toggle="${selected}" aria-pressed="${intimacyDates.includes(selected)}" ${selected > today ? "disabled" : ""}>${intimacyDates.includes(selected) ? "Bỏ ghi nhận ngày quan hệ" : "Ghi nhận ngày quan hệ"}</button>` : "<p>Em đang cho Anh xem; quyền chỉnh sửa chưa được bật.</p>"}</section>`
    : "";
  const extras = `${
    s.needs?.[selected]?.length || s.needsText?.[selected]?.trim()
      ? `<section class="shared-detail today-needs"><h3>Hôm nay Em cần</h3><p>${escape(
          (s.needs?.[selected] || [])
            .map((n) => NEED_LABELS[n])
            .filter(Boolean)
            .join(" · "),
        )}</p>${s.needsText?.[selected] ? `<p class="needs-text">${escape(s.needsText[selected])}</p>` : ""}</section>`
      : ""
  }${body && (body.pain != null || body.flow) ? `<section class="shared-detail"><h3>Cơ thể hôm nay</h3><p>${escape([body.pain != null ? `Mức đau: ${body.pain}/10` : "", body.flow ? `Lượng kinh: ${FLOW_LABELS[body.flow] || ""}` : ""].filter(Boolean).join(" · "))}</p></section>` : ""}`;
  const details = `<div class="shared-day-heading"><div><h3>${escape(dateLabel(selected))}</h3><p>Những điều Em chọn gửi Anh trong ngày này.</p></div><button type="button" class="small-button" data-companion-tab="calendar">Quay lại lịch</button></div>${"moods" in s ? `<section class="shared-detail"><h3>Cảm xúc</h3><p>${escape(s.moods[selected] || "Chưa có cảm xúc được chia sẻ trong ngày này.")}</p></section>` : ""}${"symptoms" in s ? `<section class="shared-detail"><h3>Triệu chứng</h3><p>${escape(s.symptoms[selected]?.join(", ") || "Chưa có triệu chứng được chia sẻ trong ngày này.")}</p></section>` : ""}${"journal" in s ? `<section class="shared-detail"><h3>Nhật ký Em chia sẻ</h3><p class="shared-day-note">${escape(entry?.note || "Chưa có nhật ký được chia sẻ trong ngày này.")}</p></section>` : ""}${!["moods", "symptoms", "journal", "body", "needs", "needsText", "intimacy"].some((key) => key in s) ? '<p class="shared-empty">Em chưa bật chia sẻ cảm xúc, triệu chứng hoặc nhật ký.</p>' : ""}`;
  const overview = s.analysis
    ? `<div class="shared-cycle-overview">${renderCycleOverview(s.analysis)}${status}${renderCycleNotices(s.analysis)}</div>`
    : "";
  const intimacyLegend = s.intimacy
    ? '<p class="shared-estimate">♡ Ngày quan hệ Em cho phép chia sẻ.</p>'
    : "";
  return `${!allowed ? '<p class="shared-empty">Em chưa bật chia sẻ thông tin.</p>' : ""}<section id="companion-calendar-panel" aria-label="Chu kỳ và lịch" tabindex="-1" ${tab !== "calendar" ? "hidden" : ""}>${overview}${calendar}${intimacyLegend}</section><section id="companion-day-panel" aria-label="Em chia sẻ" tabindex="-1" ${tab !== "day" ? "hidden" : ""}>${extras}${intimacy}${details}</section>`;
}
