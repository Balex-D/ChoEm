import { api } from "../../core/api.js";
import { vietnamDay } from "/shared/dates.js";
import { renderSharedDetails } from "./shared-details.js";

export function sharingPreview({ cloud, open, escape }) {
  let month = vietnamDay().slice(0, 7),
    selected = vietnamDay(),
    tab = "calendar",
    latest = 0;
  open(
    '<h2>Anh đang thấy gì?</h2><p>Bản xem trước dùng dữ liệu đã đồng bộ và cùng bộ lọc quyền với màn hình của Anh. Tên và thông tin kết nối vẫn được hiển thị khi tạm dừng chia sẻ dữ liệu cá nhân.</p><label class="form-label" for="preview-month">Tháng xem trước</label><input id="preview-month" type="month" min="1900-01" max="2199-12"><div class="preview-tabs"><button class="small-button" type="button" data-preview-tab="calendar">Chu kỳ và lịch</button><button class="small-button" type="button" data-preview-tab="day">Em chia sẻ</button></div><div id="sharing-preview" aria-live="polite"></div><p id="preview-error" role="alert"></p>',
  );
  const container = document.querySelector("#sharing-preview");
  const input = document.querySelector("#preview-month");
  input.value = month;
  let data;
  const draw = () => {
    container.innerHTML = renderSharedDetails(data, selected, escape, {
      tab,
      today: vietnamDay(),
    });
    // Month selection uses the native month input above; calendar days retain the companion behavior.
    container
      .querySelectorAll(
        "[data-shared-month-step], [data-shared-jump], [data-intimacy-toggle]",
      )
      .forEach((button) => {
        button.disabled = true;
      });
  };
  const load = async () => {
    const request = ++latest;
    container.textContent = "Đang tải bản xem trước…";
    const error = document.querySelector("#preview-error");
    try {
      if (
        !navigator.onLine ||
        !cloud.user ||
        !cloud.envelope ||
        cloud.suspended ||
        cloud.expired
      )
        throw new Error(
          "Cần đăng nhập, có mạng và tải xong dữ liệu để xem trước.",
        );
      await cloud.sync();
      if (cloud.conflict || cloud.envelope.dirty)
        throw new Error("Hãy xử lý dữ liệu chưa đồng bộ trước khi xem trước.");
      const result = await api(`/state/preview?month=${month}`);
      if (request !== latest || !container.isConnected) return;
      data = result.shared;
      draw();
      error.textContent = "";
    } catch (e) {
      if (request === latest && error.isConnected) {
        container.replaceChildren();
        error.textContent = e.message;
      }
    }
  };
  input.onchange = () => {
    if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(input.value)) return;
    month = input.value;
    selected =
      month === vietnamDay().slice(0, 7) ? vietnamDay() : month + "-01";
    void load();
  };
  input.closest("#dialog-body").addEventListener(
    "click",
    (event) => {
      const button = event.target.closest("button");
      if (!button || !data || !container.isConnected) return;
      if (button.dataset.previewTab || button.dataset.companionTab) {
        tab = button.dataset.previewTab || button.dataset.companionTab;
        draw();
      } else if (button.dataset.sharedDay) {
        selected = button.dataset.sharedDay;
        tab = "day";
        draw();
      }
    },
    {
      signal: (() => {
        const controller = new AbortController();
        container
          .closest("dialog")
          .addEventListener("close", () => controller.abort(), { once: true });
        return controller.signal;
      })(),
    },
  );
  void load();
}

export function mountSharingControls({
  root,
  cloud,
  open,
  escape,
  showError,
  toast,
  onChange,
}) {
  const controls = document.createElement("div");
  controls.className = "sharing-actions";
  const paused = Boolean(cloud.envelope?.state.privacy.paused);
  controls.innerHTML = `<button class="small-button" type="button" id="sharing-preview-open">Anh đang thấy gì?</button> <button class="small-button" type="button" id="sharing-pause" aria-pressed="${paused}">${paused ? "Tiếp tục chia sẻ theo lựa chọn cũ" : "Tạm dừng mọi chia sẻ cá nhân"}</button>`;
  root
    .querySelector(".connect-grid > section")
    ?.querySelectorAll("h3")[1]
    ?.after(controls);
  controls.querySelector("#sharing-preview-open").onclick = () =>
    sharingPreview({ cloud, open, escape });
  controls.querySelector("#sharing-pause").onclick = async (event) => {
    const button = event.target;
    button.disabled = true;
    try {
      const paused = Boolean(cloud.envelope.state.privacy.paused);
      await cloud.changePrivacy(
        {
          ...cloud.envelope.state.privacy,
          paused: !paused,
        },
        { refreshView: false },
      );
      onChange();
      toast(
        paused
          ? "Đã tiếp tục chia sẻ theo lựa chọn cũ."
          : "Đã tạm dừng chia sẻ dữ liệu cá nhân.",
      );
    } catch (e) {
      showError(e);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  };
}
