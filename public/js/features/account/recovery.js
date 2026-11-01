import { api } from "../../core/api.js";
export function forgotPasswordDialog({ open }) {
  open(
    '<h2>Quên mật khẩu</h2><p>Nhập email đã xác minh. Liên kết đặt lại có hiệu lực 30 phút và dùng một lần. Nếu chưa xác minh email, hãy liên hệ quản trị viên.</p><form id="forgot-form"><label class="form-label" for="recovery-email">Email</label><input id="recovery-email" type="email" autocomplete="email" maxlength="254" required><button class="primary">Gửi liên kết</button><p id="recovery-status" role="status"></p></form>',
  );
  document.querySelector("#forgot-form").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      const result = await api("/auth/forgot-password", {
        method: "POST",
        anonymous: true,
        body: { email: document.querySelector("#recovery-email").value },
      });
      document.querySelector("#recovery-status").textContent = result.message;
    } catch (error) {
      document.querySelector("#recovery-status").textContent = error.message;
      button.disabled = false;
    }
  };
}
// Only consume secrets after explicit user confirmation; mail scanners cannot consume links.
export function recoveryLinkDialog({ action, token, open, close, toast }) {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    toast("Liên kết không hợp lệ.");
    return;
  }
  open(
    action === "verify"
      ? '<h2>Xác minh email</h2><p>Xác nhận địa chỉ email của tài khoản đã yêu cầu liên kết này.</p><form id="recovery-link"><button class="primary">Xác minh email</button><p id="link-status" role="alert"></p></form>'
      : '<h2>Đặt lại mật khẩu</h2><form id="recovery-link"><label class="form-label" for="reset-password">Mật khẩu mới</label><input id="reset-password" type="password" minlength="6" maxlength="128" autocomplete="new-password" required><label class="form-label" for="reset-confirm">Nhập lại mật khẩu</label><input id="reset-confirm" type="password" minlength="6" maxlength="128" autocomplete="new-password" required><button class="primary">Lưu mật khẩu mới</button><p id="link-status" role="alert"></p></form>',
  );
  const form = document.querySelector("#recovery-link");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    const password = document.querySelector("#reset-password")?.value;
    if (
      action === "reset" &&
      password !== document.querySelector("#reset-confirm").value
    ) {
      document.querySelector("#link-status").textContent =
        "Mật khẩu nhập lại chưa khớp.";
      return;
    }
    button.disabled = true;
    try {
      const result = await api(
        `/auth/${action === "verify" ? "verify-email" : "reset-password"}`,
        {
          method: "POST",
          anonymous: true,
          body: { token, ...(password ? { password } : {}) },
        },
      );
      close();
      toast(result.message);
    } catch (error) {
      document.querySelector("#link-status").textContent = error.message;
      button.disabled = false;
    }
  };
}
