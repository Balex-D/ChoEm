import { vietnamDay } from "/shared/dates.js";
import { api } from "../../core/api.js";
import { daysBetween } from "/shared/cycle/cycle-analysis.js";

export async function mountPartnerMessage({
  element,
  main,
  connectionId,
  escape,
  toast,
}) {
  let envelope = null,
    dirty = false,
    saving = false,
    loading = false,
    disposed = false;
  const setDirty = (value) => {
    dirty = value;
    element.dataset.spaceDirty = String(value);
  };
  const status = (text, error = false) => {
    const node = element.querySelector(".partner-message-status");
    if (node) {
      node.textContent = text;
      node.classList.toggle("error", error);
    }
  };
  const updateCounter = (date) => {
    const slot = element.querySelector(".relationship-counter-slot");
    if (!slot) return;
    if (!date) {
      slot.replaceChildren();
      return;
    }
    const elapsed = daysBetween(date, vietnamDay());
    slot.innerHTML = `<aside class="relationship-counter" aria-label="Ngày bên nhau" title="Từ ${escape(date.split("-").reverse().join("/"))}"><b>${elapsed < 0 ? Math.abs(elapsed) : elapsed + 1}</b><span>${elapsed < 0 ? "ngày nữa đến ngày bên nhau" : "ngày bên nhau"}</span></aside>`;
  };
  const stop = () => {
    disposed = true;
    setDirty(false);
    clearInterval(interval);
    observer.disconnect();
    document.removeEventListener("relationship:updated", onUpdated);
  };
  const draw = () => {
    const editable = envelope.role === "companion";
    element.innerHTML = `<div class="partner-message-heading"><h2>Lời nhắn cho Em</h2><div class="relationship-counter-slot"></div></div><section class="card partner-message-card">${editable ? `<form><label class="form-label" for="partner-message">Anh gửi Em một chút dịu dàng</label><textarea id="partner-message" maxlength="1000" rows="4" placeholder="Có điều gì hôm nay Anh muốn nói với Em?">${escape(envelope.space.message)}</textarea><div class="partner-message-actions"><button class="primary" type="submit">Lưu lời nhắn</button><button class="small-button" type="button" data-message-refresh>Làm mới</button></div></form>` : `<p class="partner-message-text">${escape(envelope.space.message || "Anh chưa gửi lời nhắn. Một chút dịu dàng đang chờ Em ở đây ♡")}</p><button class="small-button" type="button" data-message-refresh>Làm mới</button>`}<p class="partner-message-status" role="status" aria-live="polite"></p><button type="button" class="text-button" data-message-discard hidden>Bỏ bản nháp và tải lời nhắn mới</button></section>`;
    updateCounter(envelope.space.anniversary);
    element.querySelector("[data-message-refresh]").onclick = () => {
      if (dirty) {
        status(
          "Lời nhắn có thay đổi chưa lưu. Lưu hoặc bỏ bản nháp để tải bản mới.",
        );
        element.querySelector("[data-message-discard]").hidden = false;
      } else void load();
    };
    element.querySelector("[data-message-discard]").onclick = () => {
      setDirty(false);
      void load(true);
    };
    if (!editable) return;
    const form = element.querySelector("form");
    const textarea = element.querySelector("#partner-message");
    textarea.oninput = () => {
      setDirty(true);
      status("Có thay đổi chưa lưu.");
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (saving || disposed) return;
      saving = true;
      textarea.disabled = true;
      form.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
      });
      try {
        const saved = await api(`/connections/${connectionId}/space`, {
          method: "PATCH",
          body: { revision: envelope.revision, message: textarea.value },
        });
        if (disposed || !element.isConnected) return;
        envelope = saved;
        setDirty(false);
        draw();
        status("Đã gửi lời nhắn đến Em ♡");
        toast("Đã lưu lời nhắn cho Em ♡");
      } catch (error) {
        if (disposed) return;
        if (error.status === 401 || error.status === 404) {
          element.innerHTML = `<p role="alert">${escape(error.message)}</p>`;
          stop();
        } else {
          status(error.message, true);
          if (error.status === 409)
            element.querySelector("[data-message-discard]").hidden = false;
        }
      } finally {
        saving = false;
        if (form.isConnected) {
          textarea.disabled = false;
          form.querySelectorAll("button").forEach((button) => {
            button.disabled = false;
          });
        }
      }
    };
  };
  const load = async (force = false) => {
    if (disposed || loading || saving) return;
    loading = true;
    try {
      const latest = await api(`/connections/${connectionId}/space`);
      if (
        disposed ||
        !element.isConnected ||
        saving ||
        (envelope && latest.revision < envelope.revision)
      )
        return;
      if (dirty && !force) {
        updateCounter(latest.space.anniversary);
        if (latest.revision !== envelope?.revision) {
          status(
            "Thông tin vừa được cập nhật. Bản nháp lời nhắn của Anh vẫn được giữ.",
          );
          element.querySelector("[data-message-discard]").hidden = false;
        }
        return;
      }
      const changed =
        !envelope || latest.revision !== envelope.revision || force;
      envelope = latest;
      if (changed) draw();
      else updateCounter(latest.space.anniversary);
    } catch (error) {
      if (disposed || !element.isConnected) return;
      if (!envelope || error.status === 401 || error.status === 404)
        element.innerHTML = `<p role="alert">${escape(error.message)}</p>`;
      else status(error.message, true);
      if (error.status === 401 || error.status === 404) stop();
    } finally {
      loading = false;
    }
  };
  const onUpdated = (event) => {
    if (event.detail?.connectionId === connectionId) void load();
  };
  element.innerHTML = '<p role="status">Đang tải lời nhắn…</p>';
  const interval = setInterval(() => {
    if (!document.hidden && !element.hidden && element.isConnected) void load();
  }, 15000);
  const observer = new MutationObserver(() => {
    if (!element.isConnected) stop();
  });
  observer.observe(main, { childList: true });
  document.addEventListener("relationship:updated", onUpdated);
  await load();
}
