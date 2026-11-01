export function renderCalendarPage({
  state,
  selected,
  cloud,
  dayType,
  parse,
  icon,
  calendar,
  escape,
  bindCalendar,
  bindSymptoms,
  renderPeriodControls,
  managePeriodsDialog,
  persist,
  renderCalendar,
  toast,
  setSymptoms,
  getSymptoms,
}) {
  const $ = (selector) => document.querySelector(selector);
  const e = state.entries[selected] || {};
  setSymptoms([...(e.symptoms || [])]);
  const type = dayType(parse(selected));
  $("#main").innerHTML =
    `<div class="page-intro"><div class="eyebrow">NHỊP ĐIỆU RIÊNG CỦA EM</div><h1>Lịch chu kỳ ${icon("flower")}</h1><p>Mỗi dấu nhỏ là một cách hiểu cơ thể hơn.</p></div>${calendar(true)}<section class="card day-details"><b>${parse(selected).toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b>${type === "predicted" ? "<p>Ngày kinh dự kiến, chưa được ghi nhận.</p>" : type === "ovulation" ? "<p>Ngày rụng trứng ước tính từ lịch sử đã ghi nhận.</p>" : ""}<div class="note-card day-body-record"><h3 class="mini-title">${icon("pen")} Lắng nghe cơ thể</h3><div class="symptoms"></div><textarea id="note" aria-label="Ghi chú trạng thái cơ thể" rows="2" maxlength="2000">${escape(e.note || "")}</textarea><div class="note-bottom"><span>${cloud?.user ? ((e.shared ?? state.privacy.notes) ? "Ghi chú đang bật chia sẻ ♡" : "Ghi chú đang để riêng tư ♡") : "Chỉ lưu trên thiết bị này ♡"}</span><button class="small-button" id="save-note">Lưu ghi chú ↗</button></div></div></section><p class="privacy-note">Dự đoán chỉ mang tính tham khảo, không dùng làm biện pháp tránh thai.</p>`;
  bindCalendar();
  bindSymptoms();
  const sharing = document.createElement("label");
  sharing.className = "save-symptom journal-sharing-toggle";
  sharing.title = "Chia sẻ nhật ký ngày này với Anh khi lưu ghi chú";
  sharing.innerHTML = `<input type="checkbox" id="share-day-journal" ${(e.shared ?? state.privacy.notes) ? "checked" : ""}> Chia sẻ nhật ký`;
  const bodyHeading = document.createElement("div");
  bodyHeading.className = "day-body-heading";
  const bodyTitle = $(".day-body-record .mini-title");
  bodyTitle.before(bodyHeading);
  bodyHeading.append(bodyTitle, sharing);
  const tools = document.createElement("div");
  tools.className = "period-tools";
  tools.innerHTML =
    '<button class="small-button" id="manage-periods">Các kỳ kinh đã ghi nhận</button>';
  $(".day-details").append(tools);
  renderPeriodControls();
  $("#manage-periods").onclick = managePeriodsDialog;
  $("#save-note").onclick = async () => {
    state.entries[selected] = {
      ...(state.entries[selected] || {}),
      symptoms: [...getSymptoms()],
      note: $("#note").value,
      shared: $("#share-day-journal").checked,
    };
    if (await persist()) {
      renderCalendar();
      toast("Đã cất ghi chú vào nhật ký ♡");
    }
  };
}
