import { api } from "./api.js";
export function accountDialog({
  cloud,
  open,
  close,
  escape,
  toast,
  afterLogin,
}) {
  const validatePassword = (selector) => {
    const input = document.querySelector(selector);
    input.oninvalid = () => {
      input.setCustomValidity(
        input.validity.tooShort ? "Mật khẩu cần ít nhất 6 ký tự." : "",
      );
    };
    input.oninput = () => input.setCustomValidity("");
  };
  const panel = () => {
    if (!cloud.user || cloud.expired) {
      authForm("login");
      return;
    }
    open(
      `<h2>Tài khoản của em ♡</h2><p><b>${escape(cloud.user.email)}</b><br>${escape(cloud.status)}</p><p>Dữ liệu tài khoản được lưu trên máy chủ và giữ một bản trên thiết bị để dùng ngoại tuyến.</p>${cloud.conflict ? '<div class="demo-badge"><b>Hai thiết bị đã cùng thay đổi dữ liệu.</b><p>Xuất bản sao trước khi chọn. Giữ một bản sẽ thay thế toàn bộ bản còn lại; hệ thống không tự ghi đè.</p><button class="small-button" id="keep-local">Giữ bản thiết bị này</button> <button class="small-button" id="keep-server">Nhận bản máy chủ</button></div>' : ""}<div class="account-actions"><button class="small-button" id="sync-now">Đồng bộ ngay</button><button class="small-button" id="export-data">Xuất bản sao JSON</button><button class="small-button" id="import-guest">Nhập dữ liệu khách trên thiết bị</button><button class="small-button" id="password-form">Đổi mật khẩu</button><button class="small-button" id="logout-account">Đăng xuất</button></div><p>Đăng xuất chỉ xóa bản lưu trên thiết bị này. Tài khoản và dữ liệu đã đồng bộ vẫn được giữ; bạn có thể đăng nhập lại.</p><p id="account-error" role="alert"></p>`,
    );
    const run = (id, action) => {
      const el = document.querySelector("#" + id);
      if (el)
        el.onclick = async () => {
          el.disabled = true;
          try {
            await action();
            panel();
          } catch (e) {
            document.querySelector("#account-error").textContent = e.message;
            el.disabled = false;
          }
        };
    };
    const roleControl = document.createElement("div");
    roleControl.innerHTML = `<label class="form-label" for="account-role">Vai trò</label><select id="account-role"><option value="em">Em</option><option value="anh">Anh</option></select><button class="small-button" id="save-role">Lưu vai trò</button>`;
    document.querySelector(".account-actions").before(roleControl);
    document.querySelector("#account-role").value = cloud.user.role || "em";
    run("save-role", async () => {
      const { user } = await api("/auth/role", {
        method: "PATCH",
        body: { role: document.querySelector("#account-role").value },
      });
      cloud.user = user;
      await cloud.storage.set("last-account", user);
      afterLogin();
      toast("Đã lưu vai trò.");
    });
    run("sync-now", () => cloud.sync());
    if (cloud.user.role === "anh") {
      document.querySelector("#dialog-body h2").textContent =
        "Tài khoản của Anh";
      for (const id of ["sync-now", "export-data", "import-guest"])
        document.getElementById(id).hidden = true;
    }
    document.querySelector("#export-data").onclick = () => cloud.exportData();
    run("keep-local", () => cloud.resolveConflict(true));
    run("keep-server", () => cloud.resolveConflict(false));
    document.querySelector("#import-guest").onclick = () => {
      open(
        '<h2>Nhập dữ liệu trên thiết bị?</h2><p>Thao tác này thay thế chu kỳ và nhật ký của tài khoản bằng dữ liệu khách đã lưu trên trình duyệt này. Quyền chia sẻ hiện tại được giữ nguyên. Bản tài khoản trước đó được lưu dự phòng trên thiết bị.</p><button class="primary" id="confirm-import">Nhập và đồng bộ</button><p id="import-error" role="alert"></p>',
      );
      document.querySelector("#confirm-import").onclick = async () => {
        try {
          await cloud.importGuest();
          panel();
        } catch (e) {
          document.querySelector("#import-error").textContent = e.message;
        }
      };
    };
    run("logout-account", async () => {
      await cloud.logout();
      close();
      toast("Đã đăng xuất. Dữ liệu đã đồng bộ vẫn được giữ trên tài khoản.");
    });
    document.querySelector("#password-form").onclick = () => {
      open(
        '<h2>Đổi mật khẩu</h2><form id="change-password"><label class="form-label" for="old-password">Mật khẩu hiện tại</label><input id="old-password" type="password" autocomplete="current-password" required maxlength="128"><label class="form-label" for="new-password">Mật khẩu mới</label><input id="new-password" type="password" autocomplete="new-password" minlength="6" maxlength="128" required><button class="primary">Lưu mật khẩu mới</button><p id="password-error" role="alert"></p></form>',
      );
      validatePassword("#new-password");
      document.querySelector("#change-password").onsubmit = async (e) => {
        e.preventDefault();
        const b = e.target.querySelector("button");
        b.disabled = true;
        try {
          await api("/auth/change-password", {
            method: "POST",
            body: {
              currentPassword: document.querySelector("#old-password").value,
              newPassword: document.querySelector("#new-password").value,
            },
          });
          panel();
          toast("Đã đổi mật khẩu. Các phiên khác đã bị đăng xuất.");
        } catch (err) {
          document.querySelector("#password-error").textContent = err.message;
          b.disabled = false;
        }
      };
    };
  };
  function authForm(mode) {
    let selectedRole = "em";
    open(
      `<h2>${mode === "login" ? "Chào em trở lại ♡" : "Một góc nhỏ cho riêng em"}</h2><p>Đăng nhập để đồng bộ và kết nối người đồng hành. Dữ liệu khách hiện có chỉ được đưa lên tài khoản khi em chọn nhập.</p><form id="auth-form">${mode === "register" ? '<label class="form-label" for="account-name">Tên của em</label><input id="account-name" maxlength="24" required autocomplete="nickname">' : ""}<label class="form-label" for="email">Email</label><input id="email" type="email" autocomplete="email" required maxlength="254"><label class="form-label" for="password">Mật khẩu</label><input id="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="6" maxlength="128" required><p id="auth-error" role="alert"></p><button class="primary">${mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</button></form><button class="text-button" id="auth-switch">${mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}</button><p>Phiên bản này chưa xác minh email và chưa có email khôi phục mật khẩu. Nếu quên mật khẩu, cần liên hệ người quản trị máy chủ.</p>`,
    );
    validatePassword("#password");
    if (mode === "register") {
      const form = document.querySelector("#auth-form");
      const tabs = document.createElement("div");
      tabs.className = "register-tabs";
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "Vai trò đăng ký");
      tabs.innerHTML =
        '<button type="button" role="tab" id="tab-anh" aria-controls="auth-form" aria-selected="false" tabindex="-1" data-role="anh">Anh</button><button type="button" role="tab" id="tab-em" aria-controls="auth-form" aria-selected="true" data-role="em">Em</button>';
      form.before(tabs);
      form.setAttribute("role", "tabpanel");
      form.setAttribute("aria-labelledby", "tab-em");
      document.querySelector('label[for="account-name"]').textContent = "Tên";
      const extra = document.createElement("div");
      extra.innerHTML =
        '<label class="form-label" for="confirm-password">Nhập lại mật khẩu</label><input id="confirm-password" type="password" autocomplete="new-password" required maxlength="128">';
      document.querySelector("#password").after(extra);
      const password = document.querySelector("#password");
      const confirmation = document.querySelector("#confirm-password");
      const checkConfirmation = () =>
        confirmation.setCustomValidity(
          confirmation.value && confirmation.value !== password.value
            ? "Mật khẩu nhập lại chưa khớp."
            : "",
        );
      confirmation.oninput = checkConfirmation;
      password.addEventListener("input", checkConfirmation);
      tabs.querySelectorAll("button").forEach((tab) => {
        tab.onclick = () => {
          selectedRole = tab.dataset.role;
          tabs.querySelectorAll("button").forEach((button) => {
            const active = button === tab;
            button.setAttribute("aria-selected", String(active));
            button.tabIndex = active ? 0 : -1;
          });
          form.setAttribute("aria-labelledby", tab.id);
          document.querySelector("#auth-error").textContent = "";
        };
        tab.onkeydown = (event) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const target =
              event.key === "Home"
                ? tabs.firstElementChild
                : event.key === "End"
                  ? tabs.lastElementChild
                  : tabs.querySelector(
                      `[data-role="${selectedRole === "em" ? "anh" : "em"}"]`,
                    );
            target.click();
            target.focus();
          }
        };
      });
    }
    document.querySelector("#auth-switch").onclick = () =>
      authForm(mode === "login" ? "register" : "login");
    document.querySelector("#auth-form").onsubmit = async (e) => {
      e.preventDefault();
      const b = e.target.querySelector("button");
      if (
        mode === "register" &&
        document.querySelector("#confirm-password").value !==
          document.querySelector("#password").value
      ) {
        document.querySelector("#auth-error").textContent =
          "Mật khẩu nhập lại chưa khớp.";
        return;
      }
      b.disabled = true;
      try {
        const registrationRole = selectedRole;
        await cloud.authenticate(mode, {
          email: document.querySelector("#email").value,
          password: document.querySelector("#password").value,
          ...(mode === "register"
            ? {
                name: document.querySelector("#account-name").value,
                role: registrationRole,
              }
            : {}),
        });
        let registrationMessage =
          mode === "register"
            ? "Đã tạo tài khoản."
            : "Đã đăng nhập. Em có thể nhập dữ liệu khách từ Tài khoản.";
        close();
        afterLogin();
        toast(registrationMessage);
      } catch (err) {
        document.querySelector("#auth-error").textContent = err.message;
        b.disabled = false;
      }
    };
  }
  panel();
}
