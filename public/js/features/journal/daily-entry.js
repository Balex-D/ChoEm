import { MOODS, FLOW_LABELS, checkinEntry } from "/shared/checkin.js";
import { vietnamDay } from "/shared/dates.js";

export function dailyEntry({ state, open, close, escape, toast, commit }) {
  const date = vietnamDay();
  const entry = state.entries[date] || {};
  const symptoms = [
    ...new Set([
      ...(state.symptomSuggestions || []),
      ...(entry.symptoms || []),
    ]),
  ];
  const options = (labels, selected) =>
    Object.entries(labels)
      .map(
        ([value, label]) =>
          `<option value="${escape(value)}" ${value === selected ? "selected" : ""}>${escape(label)}</option>`,
      )
      .join("");
  open(
    `<h2>Ghi lại một ngày của Em</h2><p>${escape(date.split("-").reverse().join("/"))} · Từ cảm xúc đến những thay đổi nhỏ của cơ thể, Em cứ chậm rãi ghi lại nhé.</p><form id="quick-checkin"><label class="form-label" for="quick-mood">Tâm trạng</label><select id="quick-mood">${options(Object.fromEntries(MOODS.map((m) => [m, m || "Chưa ghi nhận"])), entry.mood || "")}</select><fieldset class="checkin-options"><legend>Triệu chứng</legend>${symptoms.map((s, i) => `<label><input type="checkbox" name="quick-symptom" value="${i}" ${(entry.symptoms || []).includes(s) ? "checked" : ""}> ${escape(s)}</label>`).join("") || "<p>Em có thể thêm gợi ý triệu chứng trong Lịch chu kỳ.</p>"}</fieldset><div class="checkin-grid"><div><label class="form-label" for="quick-pain">Mức độ đau (0–10)</label><select id="quick-pain"><option value="">Chưa ghi nhận</option>${Array.from({ length: 11 }, (_, n) => `<option value="${n}" ${entry.pain === n ? "selected" : ""}>${n}${n === 0 ? " · Không đau" : ""}</option>`).join("")}</select></div><div><label class="form-label" for="quick-flow">Lượng kinh</label><select id="quick-flow">${options(FLOW_LABELS, entry.flow || "")}</select></div></div><p class="muted">${state.privacy.paused ? "Đang tạm dừng mọi chia sẻ cá nhân. " : ""}Mức đau và lượng kinh tuân theo quyền chia sẻ triệu chứng. Ghi lượng kinh không tự tạo kỳ kinh.</p><button class="primary" type="submit">Cất vào nhật ký</button><p id="quick-error" role="alert"></p></form>`,
  );
  document.querySelector("#quick-checkin").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      if (vietnamDay() !== date)
        throw new Error(
          "Đã sang ngày mới. Em đóng rồi mở lại trang ghi chép nhé.",
        );
      const saved = checkinEntry(
        {
          mood: document.querySelector("#quick-mood").value,
          symptoms: [
            ...document.querySelectorAll('[name="quick-symptom"]:checked'),
          ].map((input) => symptoms[Number(input.value)]),
          pain: document.querySelector("#quick-pain").value,
          flow: document.querySelector("#quick-flow").value,
        },
        entry,
      );
      if (await commit(date, saved)) {
        close();
        toast("Đã cất một ngày của Em vào nhật ký ♡");
      }
    } catch (error) {
      document.querySelector("#quick-error").textContent = error.message;
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  };
}

export function mountDailyActions({ main, onEntry, onNeeds }) {
  const actions = document.createElement("div");
  actions.className = "daily-actions";
  actions.innerHTML =
    '<button class="primary" type="button" data-daily-entry>Ghi lại một ngày của Em</button><button class="small-button" type="button" data-today-needs>Hôm nay Em cần gì?</button>';
  (
    main.querySelector(".greeting, .page-intro") || main.firstElementChild
  )?.after(actions);
  actions.querySelector("[data-daily-entry]").onclick = onEntry;
  actions.querySelector("[data-today-needs]").onclick = onNeeds;
}
