import { NEED_LABELS, checkinEntry } from "/shared/checkin.js";
import { vietnamDay } from "/shared/dates.js";

export function todayNeeds({
  state,
  cloud,
  open,
  close,
  escape,
  toast,
  commit,
}) {
  const date = vietnamDay(),
    entry = state.entries[date] || {};
  open(
    `<h2>Hôm nay Em cần gì?</h2><p>Một chút lắng nghe, một khoảng nghỉ, hay điều gì khác? Em cứ nói theo cách của mình nhé.</p><form id="today-needs-form"><fieldset class="checkin-options" id="quick-needs"><legend>Điều Em mong lúc này</legend>${Object.entries(
      NEED_LABELS,
    )
      .map(
        ([value, label]) =>
          `<label><input type="checkbox" name="quick-need" value="${value}" ${(entry.needs || []).includes(value) ? "checked" : ""}> ${label}</label>`,
      )
      .join(
        "",
      )}</fieldset><label class="form-label" for="needs-text">Hay Em muốn viết thêm điều gì?</label><textarea id="needs-text" rows="3" maxlength="500" aria-describedby="needs-text-hint" placeholder="Chẳng hạn: Tối nay Anh đi dạo cùng Em một chút nhé…">${escape(entry.needsText || "")}</textarea><p id="needs-text-hint">Em có thể chỉ viết lời nhắn, không cần chọn mục có sẵn. Tối đa 500 ký tự.</p><label class="save-symptom"><input id="quick-send-needs" type="checkbox" ${entry.needsShared && cloud.user ? "checked" : ""} ${!cloud.user ? "disabled" : ""}> Gửi điều này cho Anh trong hôm nay</label><p class="muted">${cloud.user ? "Anh chỉ đọc được sau khi đồng bộ và hai người đã kết nối. " : "Chưa đăng nhập thì chỉ cất riêng trên thiết bị này. "}${state.privacy.paused ? "Em đang tạm dừng chia sẻ, nên Anh chưa thấy nội dung này. " : ""}Trang nhật ký và ghi chép cơ thể của Em vẫn được giữ nguyên.</p><button class="primary" type="submit">Lưu điều Em cần</button><p id="needs-error" role="alert"></p></form>`,
  );
  document.querySelector("#today-needs-form").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      if (vietnamDay() !== date)
        throw new Error(
          "Đã sang ngày mới. Em đóng rồi mở lại để ghi điều mình cần nhé.",
        );
      const saved = checkinEntry(
        {
          needs: [
            ...document.querySelectorAll('[name="quick-need"]:checked'),
          ].map((input) => input.value),
          needsText: document.querySelector("#needs-text").value,
          needsShared:
            Boolean(cloud.user) &&
            document.querySelector("#quick-send-needs").checked,
        },
        entry,
      );
      if (await commit(date, saved, "Đã lưu điều Em cần")) {
        close();
        toast("Đã lưu điều Em cần hôm nay ♡");
      }
    } catch (error) {
      document.querySelector("#needs-error").textContent = error.message;
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  };
}
