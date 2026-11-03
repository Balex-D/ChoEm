import { api } from "../../core/api.js";
import { parseBackup } from "/shared/backup.js";
import { reminderCalendar } from "/shared/reminders.js";

export function downloadFile(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function importBackupDialog({ cloud, open, close, escape, toast }) {
  open(
    '<h2>Khôi phục bản sao JSON</h2><p>Chọn bản sao Cho Em, tối đa 2 MB. Em sẽ xem trước trước khi thay thế dữ liệu.</p><input id="backup-file" type="file" accept=".json,application/json"><div id="backup-preview"></div><p id="backup-error" role="alert"></p>',
  );
  const input = document.querySelector("#backup-file");
  const preview = document.querySelector("#backup-preview");
  const error = document.querySelector("#backup-error");
  let selection = 0;
  input.onchange = async () => {
    const token = ++selection;
    preview.replaceChildren();
    error.textContent = "";
    try {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024)
        throw new Error("File vượt giới hạn 2 MB.");
      const parsed = parseBackup(await file.text());
      if (token !== selection || !input.isConnected) return;
      preview.innerHTML = `<p><b>${escape(parsed.state.name)}</b> · ${parsed.summary.periods} kỳ kinh · ${parsed.summary.entries} nhật ký${parsed.summary.intimacy === undefined ? "" : ` · ${parsed.summary.intimacy} ngày quan hệ`}.</p><p>Thao tác thay thế dữ liệu hiện tại. Nhật ký nhập vào được đặt riêng tư; quyền chia sẻ tài khoản được giữ, kể cả quyền xem ngày quan hệ. Dự đoán sẽ được tính lại. Bản hiện tại được lưu dự phòng trên thiết bị.</p><button class="primary" id="confirm-restore">Thay thế bằng bản sao này</button>`;
      preview.querySelector("button").onclick = async (event) => {
        event.target.disabled = true;
        input.disabled = true;
        try {
          await cloud.restoreBackup(parsed.state);
          close();
          toast(
            "Đã khôi phục bản sao. Kiểm tra trạng thái đồng bộ trong Tài khoản.",
          );
        } catch (e) {
          error.textContent = e.message;
          event.target.disabled = false;
          input.disabled = false;
        }
      };
    } catch (e) {
      error.textContent = e.message;
    }
  };
}
export function reminderDialog({ cloud, open }) {
  open(
    '<h2>Nhắc lịch riêng tư</h2><p>Tải file và thêm vào ứng dụng lịch để nhận nhắc khi Cho Em đã đóng. Tiêu đề nhắc không đề cập chu kỳ. File chỉ chứa một ngày dự kiến; cần tạo lại khi ngày thay đổi.</p><label class="form-label" for="remind-days">Nhắc trước</label><select id="remind-days"><option value="1">1 ngày</option><option value="0">Đúng ngày</option><option value="2">2 ngày</option><option value="3">3 ngày</option><option value="7">7 ngày</option></select><button class="primary" id="download-reminder">Tải file lịch</button><p id="remind-error" role="alert"></p>',
  );
  document.querySelector("#download-reminder").onclick = () => {
    try {
      const text = reminderCalendar(
        cloud.hooks.local(),
        Number(document.querySelector("#remind-days").value),
      );
      downloadFile(text, "text/calendar;charset=utf-8", "cho-em-nhac-lich.ics");
    } catch (e) {
      document.querySelector("#remind-error").textContent = e.message;
    }
  };
}
export function deleteAccountDialog({ cloud, open, close, toast }) {
  open(
    '<h2>Xóa tài khoản vĩnh viễn</h2><p>Tài khoản, nhật ký, chu kỳ, kết nối và lời nhắn chung sẽ bị xóa trên máy chủ. Hãy xuất bản sao trước nếu muốn giữ. Bản sao đã tải xuống và dữ liệu trên thiết bị khác không thể xóa từ xa.</p><form id="delete-account-form"><label class="form-label" for="delete-password">Mật khẩu hiện tại</label><input id="delete-password" type="password" autocomplete="current-password" maxlength="128" required><label class="form-label" for="delete-confirm">Nhập XÓA TÀI KHOẢN để xác nhận</label><input id="delete-confirm" required autocomplete="off"><button class="primary">Xóa vĩnh viễn</button><p id="delete-error" role="alert"></p></form>',
  );
  document.querySelector("#delete-account-form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.target.querySelector("button");
    button.disabled = true;
    try {
      await api("/auth/account", {
        method: "DELETE",
        body: {
          password: document.querySelector("#delete-password").value,
          confirmation: document.querySelector("#delete-confirm").value,
        },
      });
      await cloud.clearAccount();
      close();
      toast("Đã xóa tài khoản.");
    } catch (err) {
      document.querySelector("#delete-error").textContent = err.message;
      button.disabled = false;
    }
  };
}
