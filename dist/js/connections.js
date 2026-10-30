import { api } from "./api.js";
import { invitationDialog } from "./invite-dialog.js";
import { renderSharedDetails } from "./shared-details.js";
import { parseConnectionCode } from "./connection-code.js";
import { scanConnectionQR } from "./qr-scanner.js";
export async function renderConnections({
  cloud,
  main,
  escape,
  open,
  close,
  toast,
  login,
  pendingInvite,
}) {
  main.innerHTML = `<div class="page-intro"><div class="eyebrow">THƯƠNG NHAU TỪ NHỮNG ĐIỀU NHỎ</div><h1>Người đồng hành <img class="heading-sticker" src="assets/heart.png" alt=""></h1><p>Để người ấy hiểu em hơn, theo cách em muốn.</p></div><section class="card connect-hero"><img src="assets/OmTim.png" alt="Một chiếc ôm dành cho em"><div><h2>Có người cùng em<br>qua những ngày nhạy cảm.</h2><p>Em luôn quyết định điều gì được chia sẻ. Kết nối không tự bật chia sẻ cảm xúc hoặc ghi chú.</p></div></section><div id="connection-root"><p>Đang tải…</p></div>`;
  if (cloud.user?.role === "anh")
    main.innerHTML =
      '<div id="connection-root" class="companion-root"><p>Đang tải kết nối…</p></div>';
  const root = main.querySelector("#connection-root");
  if (!cloud.user) {
    root.innerHTML =
      '<section class="card empty"><h3>Gần nhau hơn một chút ♡</h3><p>Đăng nhập để tạo mã mời hoặc chấp nhận lời mời của người ấy.</p><button class="primary" id="connect-login">Đăng nhập / Đăng ký</button></section>';
    root.querySelector("button").onclick = login;
    return;
  }
  try {
    const { connections } = await api("/connections");
    if (!root.isConnected) return;
    const owned = connections.find((c) => c.role === "owner"),
      incoming = connections.find((c) => c.role === "companion");
    root.innerHTML = `<div class="connect-grid"><section class="card"><h3>♡ Người em chọn chia sẻ</h3>${owned ? `<p>Đang chia sẻ với <b>${escape(owned.name)}</b>.</p><button class="small-button" data-unlink="${owned.id}">Ngắt kết nối</button>` : '<p>Tạo một lời mời riêng. Mã dùng một lần, hết hạn sau 2 phút. Chỉ gửi mã cho người em muốn kết nối.</p><button class="primary full-width" id="create-invite">Tạo mã mời và QR</button><button class="text-button" id="cancel-invite">Hủy mã mời đang chờ</button>'}<hr><h3>Em chọn điều muốn chia sẻ</h3>${[
      ["cycle", "Trạng thái chu kỳ"],
      ["mood", "Tâm trạng hôm nay"],
      ["symptoms", "Triệu chứng"],
      ["notes", "Nhật ký"],
    ]
      .map(
        ([k, t]) =>
          `<div class="toggle-row"><span>${t}${k === "notes" ? ' <button class="journal-info" id="journal-sharing-info" aria-label="Tìm hiểu về chia sẻ nhật ký">!</button>' : ""}</span><button class="toggle" data-privacy="${k}" role="switch" aria-label="${t}" aria-checked="${cloud.envelope?.state.privacy[k] || false}"></button></div>`,
      )
      .join(
        "",
      )}</section><section class="card"><h3>Góc của người đồng hành</h3>${incoming ? `<p>Anh đang đồng hành cùng <b>${escape(incoming.name)}</b>.</p><div id="shared-summary"><p>Đang tải trạng thái…</p></div><button class="small-button" id="refresh-summary">Làm mới</button> <button class="text-button" data-unlink="${incoming.id}">Ngắt kết nối</button>` : `<p>Nhập mã người ấy gửi, hoặc mở liên kết từ mã QR bằng camera điện thoại.</p><label class="form-label" for="invite-code">Mã mời</label><input id="invite-code" autocomplete="off" spellcheck="false" maxlength="64" value="${escape(pendingInvite || "")}" placeholder="Dán mã mời tại đây"><button class="primary full-width" id="accept-invite">Chấp nhận lời mời</button>`}</section></div><p id="connection-error" role="alert"></p>`;
    const isAnh = cloud.user.role === "anh";
    const sections = root.querySelectorAll(".connect-grid > section");
    sections[isAnh ? 0 : 1].remove();
    root.querySelector(".connect-grid").classList.add("single-role");
    const connectionState = document.createElement("p");
    connectionState.className = "connection-state";
    connectionState.setAttribute("role", "status");
    connectionState.textContent =
      owned || incoming ? "Đã liên kết Anh–Em ♡" : "Chưa liên kết tài khoản";
    const refresh = document.createElement("button");
    refresh.className = "small-button";
    refresh.id = "refresh-connections";
    refresh.textContent = "Cập nhật trạng thái";
    connectionState.append(" ", refresh);
    root.prepend(connectionState);
    if (isAnh) {
      root.classList.add("companion-root");
      root.querySelector("h3").textContent = "Anh — Người đồng hành của em";
      if (!incoming) {
        const input = root.querySelector("#invite-code");
        input.maxLength = 512;
        input.placeholder = "Nhập mã 6 ký tự, ví dụ K7M9X2";
        input.autocapitalize = "characters";
        const scan = document.createElement("button");
        scan.id = "scan-invite";
        scan.className = "small-button scan-invite";
        scan.textContent = "Quét QR bằng camera";
        input.before(scan);
        const status = document.createElement("p");
        status.id = "connection-status";
        status.setAttribute("role", "status");
        input.after(status);
        if (pendingInvite) {
          try {
            const data = parseConnectionCode(pendingInvite);
            input.value = data.code || data.token;
          } catch {
            input.value = "";
          }
        }
        root.querySelector("#accept-invite").textContent =
          "Gửi yêu cầu liên kết";
      }
    }
    const showError = (e) => {
      if (root.isConnected)
        root.querySelector("#connection-error").textContent = e.message;
    };
    const reload = () =>
      renderConnections({
        cloud,
        main,
        escape,
        open,
        close,
        toast,
        login,
        pendingInvite: "",
      });
    const bind = (selector, action) =>
      root.querySelectorAll(selector).forEach(
        (b) =>
          (b.onclick = async () => {
            b.disabled = true;
            try {
              await action(b);
            } catch (e) {
              showError(e);
            } finally {
              if (b.isConnected) b.disabled = false;
            }
          }),
      );
    bind("#refresh-connections", reload);
    bind("#journal-sharing-info", async () => {
      open(
        '<h2>Những trang nhỏ gửi Anh ♡</h2><p>Chia sẻ với Anh những dòng nhật ký để Anh hiểu và thương Em hơn. Khi nào muốn giữ cho riêng mình, Em vẫn có thể dễ dàng ẩn đi bằng cách ấn vào bài đó, rồi mở lại bất cứ khi nào Em muốn.</p><button class="primary" id="journal-info-done">Em hiểu rồi ♡</button>',
      );
      document.querySelector("#journal-info-done").onclick = close;
    });
    bind("#create-invite", async () => {
      const invite = await api("/connections/invites", {
        method: "POST",
        body: {},
      });
      invitationDialog(invite, { open, toast });
    });
    bind("#cancel-invite", async () => {
      await api("/connections/invites", { method: "DELETE", body: {} });
      toast("Đã hủy mã mời đang chờ.");
    });
    bind("#accept-invite", async () => {
      const body = parseConnectionCode(
        root.querySelector("#invite-code").value,
      );
      root.querySelector("#connection-error").textContent = "";
      const status = root.querySelector("#connection-status");
      status.textContent = "Đang xác thực và gửi yêu cầu liên kết…";
      try {
        await api("/connections/accept", { method: "POST", body });
        toast("Liên kết Anh–Em thành công ♡");
        await reload();
      } finally {
        if (status.isConnected) status.textContent = "";
      }
    });
    bind("#scan-invite", async () => {
      await scanConnectionQR({
        open,
        close,
        onScan: (raw) => {
          if (!root.isConnected) return;
          try {
            const data = parseConnectionCode(raw);
            root.querySelector("#invite-code").value = data.code || data.token;
            root.querySelector("#connection-error").textContent = "";
            root.querySelector("#connection-status").textContent =
              "?? qu?t m? m?i. Nh?n G?i y?u c?u li?n k?t ?? x?c nh?n.";
          } catch (error) {
            showError(error);
          }
        },
      });
    });
    bind("[data-unlink]", async (b) => {
      open(
        '<h2>Ngắt kết nối?</h2><p>Người đồng hành sẽ không truy cập được dữ liệu mới từ máy chủ. Thông tin họ đã đọc hoặc tự lưu trước đó không thể thu hồi.</p><button class="primary" id="confirm-unlink">Ngắt kết nối</button><p id="unlink-error" role="alert"></p>',
      );
      document.querySelector("#confirm-unlink").onclick = async () => {
        try {
          await api("/connections/" + b.dataset.unlink, {
            method: "DELETE",
            body: {},
          });
          close();
          await reload();
          toast("Đã ngắt kết nối.");
        } catch (e) {
          document.querySelector("#unlink-error").textContent = e.message;
        }
      };
    });
    bind("[data-privacy]", async (b) => {
      const k = b.dataset.privacy,
        enabled = b.getAttribute("aria-checked") !== "true";
      await cloud.changePrivacy({
        ...cloud.envelope.state.privacy,
        [k]: enabled,
      });
      await reload();
      toast("Đã cập nhật quyền chia sẻ.");
      if (k === "notes" && !enabled) {
        open(
          '<h2>Cất những trang cũ cho riêng Em</h2><p>Từ những ngày sau, nhật ký mới sẽ mặc định dành riêng cho Em. Còn những trang đã gửi Anh, Em muốn giữ lại để Anh đọc, hay cất tất cả vào góc nhỏ riêng của mình?</p><button class="primary" id="hide-old-journals">Ẩn tất cả nhật ký cũ</button><button class="small-button" id="keep-old-journals">Giữ lại cho Anh</button><p id="journal-choice-error" role="alert"></p>',
        );
        document.querySelector("#keep-old-journals").onclick = close;
        document.querySelector("#hide-old-journals").onclick = async (
          event,
        ) => {
          event.target.disabled = true;
          try {
            await cloud.changePrivacy(cloud.envelope.state.privacy, {
              hideExistingJournals: true,
            });
            close();
            await reload();
            toast("Đã cất những trang cũ vào góc riêng của Em ♡");
          } catch (error) {
            document.querySelector("#journal-choice-error").textContent =
              error.message;
            event.target.disabled = false;
          }
        };
      }
    });
    if (incoming && isAnh) {
      let summaryRequest = 0;
      let selected = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      let selectedMonth = selected.slice(0, 7);
      let sharedData = null;
      root.addEventListener("change", (event) => {
        if (
          event.target.id === "shared-month" &&
          event.target.validity.valid &&
          /^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)
        ) {
          selectedMonth = event.target.value;
          selected = selectedMonth + "-01";
          void summary();
        }
        if (
          event.target.id === "shared-date-picker" &&
          event.target.validity.valid &&
          event.target.value.startsWith(selectedMonth + "-")
        ) {
          selected = event.target.value;
          if (sharedData)
            root.querySelector("#shared-summary").innerHTML =
              renderSharedDetails(sharedData, selected, escape);
        }
      });
      root.addEventListener("click", (event) => {
        const button = event.target.closest("[data-shared-day]");
        if (button && sharedData) {
          selected = button.dataset.sharedDay;
          root.querySelector("#shared-summary").innerHTML = renderSharedDetails(
            sharedData,
            selected,
            escape,
          );
        }
      });
      const summary = async () => {
        const request = ++summaryRequest;
        const date = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Ho_Chi_Minh",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        try {
          const { shared: s } = await api(
            "/connections/" + incoming.id + "/shared?month=" + selectedMonth,
          );
          if (
            !root.isConnected ||
            request !== summaryRequest ||
            document.hidden
          )
            return;
          sharedData = s;
          root.querySelector("#shared-summary").innerHTML = renderSharedDetails(
            s,
            selected,
            escape,
          );
          root.querySelector("#connection-error").textContent = "";
        } catch (error) {
          if (!root.isConnected || request !== summaryRequest) return;
          root.querySelector("#shared-summary").replaceChildren();
          sharedData = null;
          if (error.status === 404) await reload();
          else showError(error);
        }
      };
      bind("#refresh-summary", summary);
      let busy = false;
      const refresh = async () => {
        if (busy || !root.isConnected || document.hidden) return;
        busy = true;
        try {
          await summary();
        } finally {
          busy = false;
        }
      };
      const visible = () => {
        if (document.hidden)
          root.querySelector("#shared-summary")?.replaceChildren();
        else void refresh();
      };
      const interval = setInterval(refresh, 15000);
      const observer = new MutationObserver(() => {
        if (!root.isConnected) {
          clearInterval(interval);
          observer.disconnect();
          document.removeEventListener("visibilitychange", visible);
        }
      });
      observer.observe(main, { childList: true });
      document.addEventListener("visibilitychange", visible);
      await summary();
    }
  } catch (e) {
    if (root.isConnected)
      root.innerHTML = `<div class="demo-badge">${escape(e.message)} Không lưu bản dữ liệu của người đồng hành để xem ngoại tuyến.</div>`;
  }
}
