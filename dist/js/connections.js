import { api } from "./api.js";
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
    root.innerHTML = `<div class="connect-grid"><section class="card"><h3>♡ Người em chọn chia sẻ</h3>${owned ? `<p>Đang chia sẻ với <b>${escape(owned.name)}</b>.</p><button class="small-button" data-unlink="${owned.id}">Ngắt kết nối</button>` : '<p>Tạo một lời mời riêng. Mã dùng một lần, hết hạn sau 15 phút. Chỉ gửi mã cho người em muốn kết nối.</p><button class="primary full-width" id="create-invite">Tạo mã mời và QR</button><button class="text-button" id="cancel-invite">Hủy mã mời đang chờ</button>'}<hr><h3>Em chọn điều muốn chia sẻ</h3>${[
      ["cycle", "Trạng thái chu kỳ"],
      ["mood", "Tâm trạng hôm nay"],
      ["notes", "Ghi chú và triệu chứng"],
    ]
      .map(
        ([k, t]) =>
          `<div class="toggle-row"><span>${t}</span><button class="toggle" data-privacy="${k}" role="switch" aria-label="${t}" aria-checked="${cloud.envelope?.state.privacy[k] || false}"></button></div>`,
      )
      .join(
        "",
      )}<p>Chỉ ngày hiện tại được chia sẻ. Đổi quyền cần có mạng và máy chủ xác nhận.</p></section><section class="card"><h3>Góc của người đồng hành</h3>${incoming ? `<p>Em đang đồng hành cùng <b>${escape(incoming.name)}</b>.</p><div id="shared-summary"><p>Đang tải trạng thái…</p></div><button class="small-button" id="refresh-summary">Làm mới</button> <button class="text-button" data-unlink="${incoming.id}">Ngắt kết nối</button>` : `<p>Nhập mã người ấy gửi, hoặc mở liên kết từ mã QR bằng camera điện thoại.</p><label class="form-label" for="invite-code">Mã mời</label><input id="invite-code" autocomplete="off" spellcheck="false" maxlength="64" value="${escape(pendingInvite || "")}" placeholder="Dán mã mời tại đây"><button class="primary full-width" id="accept-invite">Chấp nhận lời mời</button>`}</section></div><p id="connection-error" role="alert"></p>`;
    const isAnh = cloud.user.role === "anh";
    const sections = root.querySelectorAll(".connect-grid > section");
    sections[isAnh ? 0 : 1].remove();
    root.querySelector(".connect-grid").classList.add("single-role");
    if (isAnh) {
      root.querySelector("h3").textContent = "Anh — Người đồng hành của em";
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
    bind("#create-invite", async () => {
      const invite = await api("/connections/invites", {
        method: "POST",
        body: {},
      });
      open(
        `<h2>Một lời mời dành riêng ♡</h2><img class="invite-qr" src="${invite.qr}" alt="QR lời mời"><p>Người ấy quét QR bằng camera điện thoại, đăng nhập rồi chấp nhận. Mã hết hạn lúc ${new Date(invite.expiresAt).toLocaleTimeString("vi-VN")}.</p><label class="form-label" for="generated-invite">Hoặc gửi mã này</label><input id="generated-invite" readonly value="${escape(invite.token)}"><button class="primary" id="copy-invite">Sao chép liên kết mời</button>`,
      );
      document.querySelector("#copy-invite").onclick = async () => {
        try {
          await navigator.clipboard.writeText(invite.url);
          toast("Đã sao chép liên kết mời.");
        } catch {
          toast("Hãy sao chép mã trong ô phía trên.");
        }
      };
    });
    bind("#cancel-invite", async () => {
      await api("/connections/invites", { method: "DELETE", body: {} });
      toast("Đã hủy mã mời đang chờ.");
    });
    bind("#accept-invite", async () => {
      await api("/connections/accept", {
        method: "POST",
        body: { token: root.querySelector("#invite-code").value.trim() },
      });
      toast("Đã kết nối với người ấy ♡");
      await reload();
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
      const apply = async () => {
        await cloud.changePrivacy({
          ...cloud.envelope.state.privacy,
          [k]: enabled,
        });
        close();
        await reload();
        toast("Máy chủ đã cập nhật quyền chia sẻ.");
      };
      if (enabled) {
        open(
          `<h2>Chia sẻ ${escape(b.getAttribute("aria-label").toLowerCase())}?</h2><p>${owned ? `Người đồng hành <b>${escape(owned.name)}</b> sẽ xem được thông tin này của ngày hiện tại.` : "Thông tin này sẽ được chia sẻ với người đồng hành khi em kết nối."} Em có thể tắt lại khi có mạng.</p><button class="primary" id="confirm-sharing">Bật chia sẻ</button><p id="share-error" role="alert"></p>`,
        );
        document.querySelector("#confirm-sharing").onclick = async () => {
          try {
            await apply();
          } catch (e) {
            document.querySelector("#share-error").textContent = e.message;
          }
        };
      } else await apply();
    });
    if (incoming && isAnh) {
      const summary = async () => {
        const date = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Ho_Chi_Minh",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        const { summary: s } = await api(
          "/connections/" + incoming.id + "/summary?date=" + date,
        );
        if (!root.isConnected) return;
        root.querySelector("#shared-summary").innerHTML =
          `${"cycle" in s ? `<p><b>Chu kỳ:</b> ${s.cycle ? (s.cycle.inPeriod ? "Đang trong kỳ kinh." : `Ngày ${Number(s.cycle.day)} của chu kỳ. Kỳ tiếp theo ước tính: ${escape(s.cycle.nextDate)}.`) : "Chưa ghi nhận."}</p>` : ""}${"mood" in s ? `<p><b>Tâm trạng:</b> ${escape(s.mood || "Chưa ghi nhận")}</p>` : ""}${"note" in s ? `<p><b>Ghi chú:</b> ${escape(s.note || "Chưa có")}<br>${escape((s.symptoms || []).join(", "))}</p>` : ""}${!("cycle" in s) && !("mood" in s) && !("note" in s) ? "<p>Người ấy chưa bật chia sẻ thông tin.</p>" : ""}<p>♡ ${escape(s.care)}</p>`;
      };
      bind("#refresh-summary", summary);
      await summary();
    }
  } catch (e) {
    if (root.isConnected)
      root.innerHTML = `<div class="demo-badge">${escape(e.message)} Không lưu bản dữ liệu của người đồng hành để xem ngoại tuyến.</div>`;
  }
}
