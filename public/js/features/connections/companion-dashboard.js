import { vietnamDay } from "/shared/dates.js";
import { api } from "../../core/api.js";
import { renderSharedDetails } from "./shared-details.js";
import { calendarIcon, journalIcon } from "../../core/icons.js";

export async function mountCompanionDashboard({
  root,
  main,
  connectionId,
  escape,
  open,
  close,
  reload,
  showError,
  overviewElement,
}) {
  let selected = vietnamDay();
  let month = selected.slice(0, 7);
  let tab = "overview";
  let data = null;
  let requestId = 0;
  const target = root.querySelector("#shared-summary");
  const navigation = [];
  const parentButtons = [];
  const labels = {
    overview: "Người đồng hành",
    calendar: "Chu kỳ và lịch",
    day: "Em chia sẻ",
  };
  const syncNavigation = () => {
    for (const { button } of parentButtons) {
      button.classList.toggle("active", tab === "overview");
      if (tab === "overview") button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    for (const group of navigation) {
      group.querySelectorAll("[data-companion-nav]").forEach((button) => {
        const active = button.dataset.companionNav === tab;
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
    }
    const label = document.querySelector("#page-label");
    if (label && root.isConnected) label.textContent = labels[tab];
  };
  const draw = () => {
    if (root.isConnected) {
      target.hidden = tab === "overview";
      if (overviewElement) overviewElement.hidden = tab !== "overview";
      if (data)
        target.innerHTML = renderSharedDetails(data, selected, escape, {
          tab,
          today: vietnamDay(),
        });
      syncNavigation();
    }
  };
  const navigate = (next) => {
    if (!(next in labels)) return;
    tab = next;
    draw();
  };
  for (const id of ["nav", "mobile-nav"]) {
    const parent = document.querySelector(`#${id} [data-view="connect"]`);
    if (!parent) continue;
    parentButtons.push({ button: parent, onclick: parent.onclick });
    parent.onclick = () => {
      navigate("overview");
      window.scrollTo(0, 0);
    };
    const group = document.createElement("div");
    group.className = "companion-peer-nav";
    group.innerHTML = Object.entries(labels)
      .filter(([key]) => key !== "overview")
      .map(
        ([key, label]) =>
          `<button type="button" data-companion-nav="${key}" aria-controls="companion-${key}-panel">${key === "calendar" ? calendarIcon() : journalIcon()}<span>${label}</span></button>`,
      )
      .join("");
    group.querySelectorAll("button").forEach((button) => {
      button.onclick = () => {
        navigate(button.dataset.companionNav);
        window.scrollTo(0, 0);
      };
    });
    parent.after(group);
    navigation.push(group);
  }
  syncNavigation();
  const load = async () => {
    const request = ++requestId;
    try {
      const { shared } = await api(
        `/connections/${connectionId}/shared?month=${month}`,
      );
      if (!root.isConnected || request !== requestId || document.hidden) return;
      data = shared;
      draw();
      root.querySelector("#connection-error").textContent = "";
    } catch (error) {
      if (!root.isConnected || request !== requestId) return;
      data = null;
      target.replaceChildren();
      if (error.status === 404) await reload();
      else showError(error);
    }
  };
  const changeMonth = async (value) => {
    if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(value)) return;
    month = value;
    selected =
      month === vietnamDay().slice(0, 7) ? vietnamDay() : month + "-01";
    tab = "calendar";
    data = null;
    target.innerHTML = '<p role="status">Đang tải lịch của Em…</p>';
    await load();
  };
  const jump = (part) => {
    const [year, number] = month.split("-").map(Number);
    open(
      `<h2>${part === "month" ? "Chọn tháng" : "Chọn năm"}</h2><form id="shared-jump-form"><label class="form-label" for="shared-jump-value">${part === "month" ? "Tháng" : "Năm"}</label>${part === "month" ? `<select id="shared-jump-value">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${number === i + 1 ? "selected" : ""}>Tháng ${i + 1}</option>`).join("")}</select>` : `<input id="shared-jump-value" type="number" min="1900" max="2199" step="1" required value="${year}">`}<button class="primary" type="submit">Xem lịch</button></form>`,
    );
    const input = document.querySelector("#shared-jump-value");
    input.focus();
    document.querySelector("#shared-jump-form").onsubmit = (event) => {
      event.preventDefault();
      if (!input.checkValidity()) return;
      const value = Number(input.value);
      const next =
        part === "month"
          ? `${year}-${String(value).padStart(2, "0")}`
          : `${value}-${String(number).padStart(2, "0")}`;
      close();
      void changeMonth(next);
    };
  };
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !root.contains(button) || button.disabled) return;
    if (button.dataset.companionTab) {
      navigate(button.dataset.companionTab);
      target
        .querySelector(`#companion-${tab}-panel`)
        ?.focus({ preventScroll: true });
    } else if (button.dataset.sharedDay && data) {
      selected = button.dataset.sharedDay;
      navigate("day");
      target
        .querySelector("#companion-day-panel")
        ?.focus({ preventScroll: true });
    } else if (button.dataset.sharedMonthStep) {
      const [year, number] = month.split("-").map(Number);
      const date = new Date(
        year,
        number - 1 + Number(button.dataset.sharedMonthStep),
        1,
        12,
      );
      void changeMonth(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      );
    } else if (button.dataset.sharedJump) jump(button.dataset.sharedJump);
  });
  root.querySelector("#refresh-summary").onclick = () => void load();
  let busy = false;
  const refresh = async () => {
    if (
      busy ||
      !root.isConnected ||
      document.hidden ||
      document.querySelector("#dialog")?.open
    )
      return;
    busy = true;
    try {
      await load();
    } finally {
      busy = false;
    }
  };
  const visible = () => {
    if (document.hidden) {
      ++requestId;
      data = null;
      target.replaceChildren();
    } else void refresh();
  };
  const interval = setInterval(refresh, 15000);
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      ++requestId;
      data = null;
      clearInterval(interval);
      navigation.forEach((group) => group.remove());
      parentButtons.forEach(({ button, onclick }) => {
        button.onclick = onclick;
      });
      observer.disconnect();
      document.removeEventListener("visibilitychange", visible);
    }
  });
  observer.observe(main, { childList: true });
  document.addEventListener("visibilitychange", visible);
  await load();
}
