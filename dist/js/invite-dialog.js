export function invitationDialog(invite, { open, toast }) {
  open(
    `<h2>Một lời mời dành riêng ♡</h2><img class="invite-qr" src="${invite.qr}" alt="QR lời mời"><p class="invite-countdown">Mã còn hiệu lực <strong id="invite-countdown" role="timer">02:00</strong></p><label class="form-label" for="generated-invite">Hoặc gửi mã này</label><input id="generated-invite" readonly value="${invite.code}"><button class="small-button" id="copy-code">Sao chép mã 6 ký tự</button><button class="primary" id="copy-invite">Sao chép liên kết mời</button>`,
  );
  const timer = document.querySelector("#invite-countdown");
  const dialog = timer.closest("dialog");
  const cleanup = () => {
    clearInterval(interval);
    observer.disconnect();
    dialog.removeEventListener("close", cleanup);
  };
  const observer = new MutationObserver(() => {
    if (!timer.isConnected || !dialog.open) cleanup();
  });
  let expired = false;
  const update = () => {
    if (expired) return;
    const remaining = Math.max(
      0,
      Math.ceil((Date.parse(invite.expiresAt) - Date.now()) / 1000),
    );
    timer.textContent = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
    if (!remaining) {
      expired = true;
      timer.parentElement.textContent = "Mã đã hết hạn. Đóng để tạo mã mới.";
      dialog.querySelector(".invite-qr").remove();
      dialog.querySelector("#generated-invite").value = "";
      dialog.querySelectorAll("#copy-code,#copy-invite").forEach((button) => {
        button.disabled = true;
      });
      cleanup();
    }
  };
  const interval = setInterval(update, 250);
  observer.observe(dialog, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["open"],
  });
  dialog.addEventListener("close", cleanup);
  const copy = async (value, message) => {
    if (Date.now() >= Date.parse(invite.expiresAt)) {
      update();
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast(message);
    } catch {
      toast("Hãy sao chép mã trong ô phía trên.");
    }
  };
  dialog.querySelector("#copy-code").onclick = () =>
    copy(invite.code, "Đã sao chép mã mời.");
  dialog.querySelector("#copy-invite").onclick = () =>
    copy(invite.url, "Đã sao chép liên kết mời.");
  update();
}
