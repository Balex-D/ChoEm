import { analyzeCycles, recordLocalForecast } from "./js/cycle-analysis.js";
import { renderCycleOverview, renderCycleNotices, renderCycleCharts } from "./js/cycle-analysis-view.js";
import { cycleDayType } from "./js/cycle-model.js";
import { attachPeriodDrag } from "./js/period-drag.js";
import { resolvePeriods, periodContaining, ongoingPeriod, recordPeriodRange, recordPeriodDragRange, beginPeriod, finishPeriod, removePeriod, periodDayCount } from "./js/period-records.js";
import { Cloud } from "./js/cloud.js";
import { accountDialog } from "./js/account.js";
import { renderConnections } from "./js/connections.js";
let cloud;
let periodDragCleanup = null;
let periodSaving = false;
let pendingInvite = location.hash.startsWith("#invite=") ? location.href : "";
if (pendingInvite) history.replaceState(null, "", location.pathname);
const $ = (s) => document.querySelector(s);
const paths = {
  home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m3 0h1m3 0h1m-9 3h1m3 0h1"/>',
  journal:
    '<path d="M4 4h12a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3Zm0 13h15M8 8h7m-7 4h5"/>',
  heart:
    '<path d="M20.8 5.6a5.5 5.5 0 0 0-8.8 1 5.5 5.5 0 0 0-8.8-1C-1 11 8 18 12 21c4-3 13-10 8.8-15.4Z"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  pen: '<path d="m4 15-1 6 6-1L21 8l-5-5Z M13 6l5 5"/>',
};
const icon = (n) =>
  n === "heart" || n === "clover" || n === "flower"
    ? `<span class="icon"><img src="assets/${n}.png" alt="" aria-hidden="true"></span>`
    : `<span class="icon"><svg viewBox="0 0 24 24">${paths[n] || paths.heart}</svg></span>`;
const moods = [
  ["Cute", "Vui vẻ"],
  ["OmTim", "Yêu đời"],
  ["Sleepy", "Mệt mỏi"],
  ["Cry", "Buồn chút"],
  ["Angry", "Cáu kỉnh"],
  ["XauHo", "Nhạy cảm"],
];
const symptoms = ["Đau bụng", "Đau lưng", "Đau đầu", "Căng ngực"];
const vietnamDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const today = new Date(vietnamDay() + "T12:00:00");
today.setHours(12, 0, 0, 0);
const key = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
let todayKey = key(today);
const parse = (s) => new Date(s + "T12:00:00");
const add = (d, n) => {
  let x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const diff = (a, b) => Math.round((a - b) / 86400000);
let db,
  state,
  view = "home",
  month = new Date(today.getFullYear(), today.getMonth(), 1, 12),
  selected = todayKey,
  activeSymptoms = [],
  activeMood = "",
  installPrompt;
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const defaultState = {
  name: "Em",
  forecasts: [],
  symptomSuggestions: [...symptoms],
  starts: [],
  ends: {},
  entries: {},
  privacy: { cycle: true, mood: false, notes: false, symptoms: false },
};
async function init() {
  try {
    db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("cho-em", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("data");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const storage = {
      get: (k) =>
        new Promise((resolve, reject) => {
          const r = db.transaction("data").objectStore("data").get(k);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        }),
      set: (k, v) =>
        new Promise((resolve, reject) => {
          const t = db.transaction("data", "readwrite");
          t.objectStore("data").put(v, k);
          t.oncomplete = resolve;
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        }),
      removeAccount: (id) =>
        new Promise((resolve, reject) => {
          const t = db.transaction("data", "readwrite"),
            store = t.objectStore("data");
          const r = store.openCursor();
          r.onsuccess = () => {
            const c = r.result;
            if (c) {
              if (
                c.key === "account:" + id ||
                String(c.key).startsWith("backup:" + id + ":")
              )
                c.delete();
              c.continue();
            }
          };
          t.oncomplete = resolve;
          t.onerror = () => reject(t.error);
        }),
    };
    state = {
      ...structuredClone(defaultState),
      ...(await storage.get("state")),
    };
    delete state.length; delete state.duration;
    state = recordLocalForecast(state, todayKey);
    await storage.set("state", state);
    cloud = new Cloud(storage, {
      empty: () => structuredClone(defaultState),
      local: () => state,
      status: (message, user) => {
        const el = $(".local-status");
        el.textContent = (user ? "☁ " : "○ ") + message;
        el.title = user ? "Tài khoản: " + user.email : "Đăng nhập để đồng bộ";
      },
      remote: (next) => {
        state = next;
        render();
      },
      canRefresh: () => !$("#dialog").open && !$("#main").classList.contains("period-dragging") && !hasUnsavedDraft(),
    });
    render();
    await cloud.start();
    const el = $(".local-status");
    el.role = "button";
    el.tabIndex = 0;
    el.onclick = openAccount;
    el.onkeydown = (e) => {
      if (e.key === "Enter") openAccount();
    };
    if (pendingInvite) {
      view = "connect";
      render();
    }
  } catch (e) {
    state ??= structuredClone(defaultState);
    render();
    toast("Không thể mở bộ nhớ cục bộ. Hãy cho phép lưu trữ và tải lại trang.");
  }
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("./sw.js").catch(() => {});
}
function hasUnsavedDraft() {
  if (view !== "calendar" || !$("#note")) return false;
  const e = state.entries[selected] || {};
  return (
    $("#note").value !== (e.note || "") ||
    JSON.stringify([...activeSymptoms].sort()) !==
      JSON.stringify([...(e.symptoms || [])].sort()) ||
    ($("#share-day-journal")?.checked ?? false) !== (e.shared ?? Boolean(state.privacy.notes))
  );
}
async function persist() {
  try {
    if (!cloud) throw new Error("Chưa khởi tạo bộ nhớ.");
    if (!cloud.user) state = recordLocalForecast(state, todayKey);
    await cloud.save(state);
    return true;
  } catch (e) {
    toast(e.message || "Chưa lưu được dữ liệu. Vui lòng thử lại.");
    return false;
  }
}
function openAccount() {
  if (!cloud) return toast("Chưa khởi tạo bộ nhớ. Hãy tải lại trang.");
  accountDialog({
    cloud,
    open: openDialog,
    close: () => $("#dialog").close(),
    escape,
    toast,
    afterLogin: () => {
      if (pendingInvite) view = "connect";
      render();
    },
  });
}
function toast(s) {
  $("#toast").textContent = s;
  $("#toast").classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(
    () => $("#toast").classList.remove("show"),
    3200,
  );
}
function openDialog(html) {
  $("#dialog-body").innerHTML = html;
  $("#dialog").showModal();
}
$(".dialog-close").onclick = () => $("#dialog").close();
$("#dialog").onclick = (e) => {
  if (e.target === $("#dialog")) $("#dialog").close();
};
const tabs = [
  ["home", "Hôm nay", "home"],
  ["calendar", "Lịch chu kỳ", "calendar"],
  ["journal", "Nhật ký", "journal"],
  ["connect", "Người đồng hành", "heart"],
];
function renderNav() {
  const isAnh = cloud?.user?.role === "anh";
  document.body.classList.toggle("companion-mode", isAnh);
  for (const id of ["nav", "mobile-nav"]) {
    $("#" + id).innerHTML = (isAnh ? tabs.filter(t => t[0] === "connect") : tabs)
      .map(
        ([v, t, i]) =>
          `<button data-view="${v}" class="${v === view ? "active" : ""}" ${v === view ? 'aria-current="page"' : ""}>${icon(i)}<span>${t}</span></button>`,
      )
      .join("");
    $("#" + id)
      .querySelectorAll("button")
      .forEach(
        (b) =>
          (b.onclick = () => {
            view = b.dataset.view;
            render();
            window.scrollTo(0, 0);
          }),
      );
  }
  $("#page-label").textContent = tabs.find((t) => t[0] === view)[1];
}
function cycleInfo() {
  const analysis = analyzeCycles(state, todayKey);
  const start = analysis.lastPeriodStart;
  if (!start) return { exists:false, analysis, next:null, remain:null };
  const next = analysis.nextPeriodStart ? parse(analysis.nextPeriodStart) : null;
  return { exists:true,start,day:diff(today,parse(start))+1,next,remain:next?diff(next,today):null,inPeriod:!state.ends[start],analysis };
}
function dayType(d) { return cycleDayType(state, key(d), todayKey); }
function hasBodyRecord(k) {
  const e = state.entries[k];
  return !!(e && ((e.symptoms || []).length || (e.note || "").trim()));
}
function calendar(wide = false) {
  const first = new Date(month),
    offset = (first.getDay() + 6) % 7;
  const start = add(first, -offset),
    count =
      Math.ceil(
        (offset +
          new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) /
          7,
      ) * 7;
  return `<section class="card calendar-card ${wide ? "wide-calendar" : ""}"><div class="calendar-heading"><h3>Tháng ${month.getMonth() + 1}, ${month.getFullYear()}</h3><div class="month-control"><button id="prev-month" aria-label="Tháng trước">‹</button><button id="next-month" aria-label="Tháng sau">›</button></div></div><div class="week">${["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((s) => `<span>${s}</span>`).join("")}</div><div class="days">${Array.from(
    { length: count },
    (_, i) => {
      const d = add(start, i),
        k = key(d);
      return `<button data-day="${k}" class="day ${dayType(d)} ${hasBodyRecord(k) ? "has-body-record" : ""} ${k === todayKey ? "today" : ""} ${d.getMonth() !== month.getMonth() ? "outside" : ""} ${wide && k === selected ? "selected" : ""}" aria-label="${d.toLocaleDateString("vi-VN")} ${dayType(d) === "period" ? "ngày kinh" : ""}">${d.getDate()}</button>`;
    },
  ).join(
    "",
  )}</div><div class="calendar-legend"><span><i class="dot"></i> Ngày kinh</span><span><i class="dot dashed"></i> Kỳ kinh dự kiến</span><span><i class="dot purple"></i> Rụng trứng dự kiến</span></div></section>`;
}
function bindCalendar({ keepDrag = false } = {}) {
  if (!$(".period-drag-help")) {
    const help = document.createElement("p"); help.className = "period-drag-help";
    help.textContent = "Nhấn giữ và kéo để ghi nhận khoảng ngày. Giữ sát mép lịch để chuyển tháng. Kéo từ ngày đã ghi để sửa ngày kết thúc.";
    $(".calendar-card").append(help);
  }
  const heading = $(".calendar-heading h3");
  heading.innerHTML = `<button class="calendar-jump" id="jump-month" aria-label="Chọn tháng">Tháng ${month.getMonth() + 1}</button>, <button class="calendar-jump" id="jump-year" aria-label="Chọn năm">${month.getFullYear()}</button>`;
  const jump = (focus) => {
    openDialog(`<h2>Chọn tháng và năm</h2><form id="jump-calendar"><label class="form-label" for="calendar-month">Tháng</label><select id="calendar-month">${Array.from({length:12}, (_, i) => `<option value="${i}" ${i === month.getMonth() ? "selected" : ""}>Tháng ${i+1}</option>`).join("")}</select><label class="form-label" for="calendar-year">Năm</label><input id="calendar-year" type="number" min="1900" max="2199" required value="${month.getFullYear()}"><button class="primary">Xem lịch</button></form>`);
    $(focus).focus();
    $("#jump-calendar").onsubmit = (event) => {
      event.preventDefault();
      month = new Date(Number($("#calendar-year").value), Number($("#calendar-month").value), 1, 12);
      $("#dialog").close();
      render();
    };
  };
  $("#jump-month").onclick = () => jump("#calendar-month");
  $("#jump-year").onclick = () => jump("#calendar-year");
  $("#prev-month").onclick = () => {
    month = new Date(month.getFullYear(), month.getMonth() - 1, 1, 12);
    render();
  };
  $("#next-month").onclick = () => {
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1, 12);
    render();
  };
  document.querySelectorAll("[data-day]").forEach(
    (b) =>
      (b.onclick = () => {
        selected = b.dataset.day;
        view = "calendar";
        render();
      }),
  );
  if (!keepDrag) {
    periodDragCleanup?.();
    periodDragCleanup = attachPeriodDrag({
      root: $("#main"), today: todayKey, canStart: () => !periodSaving && cloud?.user?.role !== "anh",
      anchorForDay: day => { const period = periodContaining(state, day, todayKey); return { start:period?.start || day, editStart:period?.start || null, end:period?.end || null }; },
      onCommit: (from,to,editStart) => savePeriodChange(current => recordPeriodDragRange(current,from,to,todayKey,editStart), to),
      onError: error => toast(error.message),
      onMonth: direction => {
        const next = new Date(month.getFullYear(),month.getMonth()+direction,1,12);
        if (next.getFullYear()<1900 || next > new Date(today.getFullYear(),today.getMonth(),1,12)) return null;
        month = next;
        const card = $(".calendar-card");
        const wide = card.classList.contains("wide-calendar");
        card.outerHTML = calendar(wide);
        bindCalendar({ keepDrag:true });
        const end = new Date(month.getFullYear(),month.getMonth()+1,0,12);
        return direction > 0 ? key(month) : key(end) > todayKey ? todayKey : key(end);
      },
    });
  }
}
function render() {
  state = resolvePeriods(state, todayKey);
  periodDragCleanup?.(); periodDragCleanup = null;
  if (cloud?.user?.role === "anh") view = "connect";
  renderNav();
  if (view === "home") renderHome();
  if (view === "calendar") renderCalendar();
  if (view === "journal") renderJournal();
  if (view === "connect") renderConnect();
}
function refreshCalendarDate() {
  if (!state || $("#dialog").open || $("#main").classList.contains("period-dragging") || hasUnsavedDraft()) return;
  const current = new Date(vietnamDay() + "T12:00:00");
  const nextKey = key(current);
  if (nextKey === todayKey) return;
  const followingToday = selected === todayKey;
  today.setTime(current.getTime()); todayKey = nextKey;
  if (followingToday) { selected = todayKey; month = new Date(today.getFullYear(),today.getMonth(),1,12); }
  render();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshCalendarDate(); });
window.addEventListener("pageshow", refreshCalendarDate);
setInterval(() => { if (!document.hidden) refreshCalendarDate(); },60000);
async function savePeriodChange(change, selectedDay = selected) {
  if (periodSaving) return false;
  periodSaving = true;
  const previous = structuredClone(state);
  try {
    if (view === "calendar" && hasUnsavedDraft()) state.entries[selected] = { ...(state.entries[selected] || {}), symptoms:[...activeSymptoms], note:$("#note").value, shared:$("#share-day-journal").checked };
    state = change(state);
    if (!(await persist())) { state = previous; return false; }
    selected = selectedDay;
    month = new Date(parse(selected).getFullYear(),parse(selected).getMonth(),1,12);
    view = "calendar";
    if ($("#dialog").open) $("#dialog").close();
    render();
    toast("Đã lưu kỳ kinh của Em ♡");
    return true;
  } catch (error) { state = previous; toast(error.message); return false; }
  finally { periodSaving = false; }
}
function renderCycleHero(c) {
  const a = c.analysis;
  const displayDate = day => day ? day.split("-").reverse().join("/") : "Chưa đủ dữ liệu";
  const data = [["Chu kỳ trung bình",a.averageCycleLength === null ? "Chưa đủ dữ liệu" : `${a.averageCycleLength} ngày`],["Hành kinh trung bình",a.averagePeriodLength === null ? "Chưa đủ dữ liệu" : `${a.averagePeriodLength} ngày`],["Kỳ kinh gần nhất",displayDate(a.lastPeriodStart)],["Kỳ tiếp theo dự kiến",displayDate(a.nextPeriodStart)]];
  return `<section class="card cycle-card"><div class="card-top"><span>Chu kỳ của Em</span><span class="pill">${c.inPeriod ? "♡ Đang ghi nhận kỳ kinh" : "♡ Nhịp điệu riêng"}</span></div><div class="cycle-center"><div class="cycle-text"><p>Mình cùng</p><h2>hiểu em</h2><p>từng ngày một nhé! ♡</p></div><img class="hero-sticker" src="assets/OmTim.png" alt="Cô gái ôm trái tim"><span class="spark">✧</span></div><div class="hero-cycle-data">${c.inPeriod ? `<p class="hero-period-status">Đang ghi nhận: ngày thứ ${c.day}</p>` : ""}<dl>${data.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl></div><button class="primary" id="period-action">${icon("calendar")} ${c.inPeriod?"Kết thúc kỳ kinh":"Ghi nhận kỳ kinh"}</button></section>`;
}
function renderHome() {
  const c = cycleInfo(),
    e = state.entries[todayKey] || {};
  activeMood = e.mood || "";
  activeSymptoms = [...(e.symptoms || [])];
  const date = today.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
  $("#main").innerHTML =
    `<div class="greeting"><div><div class="eyebrow">MỘT CHÚT QUAN TÂM MỖI NGÀY</div><h1>Chào ${escape(state.name)}, ngày mới dịu dàng <img class="greeting-star" src="assets/greeting-star.png" alt="" aria-hidden="true"></h1><p>Cơ thể đang kể chuyện, mình cùng lắng nghe nhé.</p></div><div class="date-tag">${icon("calendar")}${date}</div></div><div class="dashboard-grid">${renderCycleHero(c)}${calendar()}</div><div class="section-title"><h2>Hôm nay em cảm thấy thế nào?</h2><span>Cảm xúc nào cũng đáng được ôm ♡</span></div><section class="card mood-box"><div class="mood-options">${moods.map(([img, label]) => `<button class="mood-option ${activeMood === label ? "chosen" : ""}" data-mood="${label}" aria-pressed="${activeMood === label}"><img src="assets/${img}.png" alt=""><span>${label}</span>${activeMood === label ? '<b class="mood-check">✓</b>' : ""}</button>`).join("")}</div></section><div class="lower-grid"><section class="card care-card"><h3 class="mini-title">✧ Một chút dịu dàng</h3><p>Không cần phải luôn tràn đầy năng lượng.<br>Một cốc nước ấm, một khoảng nghỉ nhỏ.<br>Hôm nay, cứ nhẹ nhàng với mình thôi.</p><button id="care-link">Ghé góc người đồng hành ↗</button><img src="assets/HoldPhone.png" alt="Cô gái cầm điện thoại"></section></div><div class="privacy-note">${icon("lock")} ${cloud?.user ? "Góc nhỏ riêng tư. Dữ liệu được đồng bộ theo tài khoản của em." : "Góc nhỏ riêng tư. Dữ liệu của em được lưu trên thiết bị này."}</div>`;
  bindCalendar();
  $("#period-action").onclick = () =>
    handlePeriodAction(todayKey);
  document.querySelectorAll("[data-mood]").forEach(
    (b) =>
      (b.onclick = async () => {
        activeMood = b.dataset.mood;
        state.entries[todayKey] = {
          shared: Boolean(state.privacy.notes),
          ...(state.entries[todayKey] || {}),
          mood: activeMood,
        };
        if (await persist()) {
          renderHome();
          toast("Đã ghi lại cảm xúc của em ♡");
        }
      }),
  );
  $("#care-link").onclick = () => {
    view = "connect";
    render();
  };
}
function renderCalendar() {
  const c = cycleInfo(),
    e = state.entries[selected] || {};
  activeSymptoms = [...(e.symptoms || [])];
  const type = dayType(parse(selected));
  $("#main").innerHTML =
    `<div class="page-intro"><div class="eyebrow">NHỊP ĐIỆU RIÊNG CỦA EM</div><h1>Lịch chu kỳ ${icon("flower")}</h1><p>Mỗi dấu nhỏ là một cách hiểu cơ thể hơn.</p></div>${renderCycleOverview(c.analysis)}${renderCycleNotices(c.analysis)}${calendar(true)}<section class="card day-details"><b>${parse(selected).toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b>${type === "predicted" ? "<p>Ngày kinh dự kiến, chưa được ghi nhận.</p>" : type === "ovulation" ? "<p>Ngày rụng trứng ước tính từ lịch sử đã ghi nhận.</p>" : ""}<div class="note-card day-body-record"><h3 class="mini-title">${icon("pen")} Lắng nghe cơ thể</h3><div class="symptoms"></div><textarea id="note" aria-label="Ghi chú trạng thái cơ thể" rows="2" maxlength="2000">${escape(e.note || "")}</textarea><div class="note-bottom"><span>${cloud?.user ? ((e.shared ?? state.privacy.notes) ? "Ghi chú đang bật chia sẻ ♡" : "Ghi chú đang để riêng tư ♡") : "Chỉ lưu trên thiết bị này ♡"}</span><button class="small-button" id="save-note">Lưu ghi chú ↗</button></div></div></section><p class="privacy-note">Dự đoán chỉ mang tính tham khảo, không dùng làm biện pháp tránh thai.</p>`;
  bindCalendar();
  bindSymptoms();
  const sharing = document.createElement("label");
  sharing.className = "save-symptom";
  sharing.innerHTML = `<input type="checkbox" id="share-day-journal" ${(e.shared ?? state.privacy.notes) ? "checked" : ""}> Chia sẻ nhật ký này với Anh`;
  $("#note").after(sharing);
  const tools = document.createElement("div");
  tools.className = "period-tools";
  tools.innerHTML = '<button class="small-button" id="manage-periods">Các kỳ kinh đã ghi nhận</button>';
  $(".day-details").append(tools);
  renderPeriodControls();
  $("#manage-periods").onclick = managePeriodsDialog;
  $("#save-note").onclick = async () => {
    state.entries[selected] = {
      ...(state.entries[selected] || {}),
      symptoms: [...activeSymptoms],
      note: $("#note").value,
      shared: $("#share-day-journal").checked,
    };
    if (await persist()) {
      renderCalendar();
      toast("Đã cất ghi chú vào nhật ký ♡");
    }
  };
}
function bindSymptoms() {
  const container = $(".symptoms");
  const title = $(".day-body-record .mini-title");
  title.innerHTML = `<button class="edit-symptoms" aria-label="Chỉnh sửa biểu hiện" aria-pressed="false">${icon("pen")}</button> Lắng nghe cơ thể`;
  let editing = false;
  const draw = () => {
    const suggestions = state.symptomSuggestions ?? symptoms;
    const options = [...new Set([...suggestions, ...activeSymptoms])];
    container.innerHTML = options.map((s, i) => `<span class="symptom-item"><button class="chip ${activeSymptoms.includes(s) ? "selected" : ""}" data-option="${i}" aria-pressed="${activeSymptoms.includes(s)}">${escape(s)}</button>${editing && suggestions.includes(s) ? `<button class="remove-symptom" data-remove="${i}" aria-label="Xóa gợi ý ${escape(s)}">×</button>` : ""}</span>`).join("") + (editing ? '<button class="chip add-symptom" aria-label="Thêm biểu hiện">＋</button>' : "");
    container.querySelectorAll("[data-option]").forEach(b => {
      b.onclick = () => {
        const s = options[Number(b.dataset.option)];
        activeSymptoms = activeSymptoms.includes(s) ? activeSymptoms.filter(x => x !== s) : [...activeSymptoms, s];
        draw();
      };
    });
    container.querySelectorAll("[data-remove]").forEach(b => {
      b.onclick = () => {
        const s = options[Number(b.dataset.remove)];
        openDialog(`<h2>Xóa gợi ý biểu hiện?</h2><p>“${escape(s)}” sẽ không còn trong gợi ý cho các ngày sau. Nhật ký đã lưu vẫn được giữ.</p><button class="primary" id="confirm-remove-symptom">Xóa gợi ý</button> <button class="small-button" id="cancel-remove-symptom">Hủy</button>`);
        $("#cancel-remove-symptom").onclick = () => $("#dialog").close();
        $("#confirm-remove-symptom").onclick = async () => {
          const previous = state.symptomSuggestions;
          state.symptomSuggestions = suggestions.filter(x => x !== s);
          if (await persist()) {
            $("#dialog").close();
            draw();
          } else state.symptomSuggestions = previous;
        };
      };
    });
    const addButton = container.querySelector(".add-symptom");
    if (addButton) addButton.onclick = () => {
      openDialog('<h2>Thêm biểu hiện</h2><form id="add-symptom-form"><label class="form-label" for="symptom-name">Biểu hiện của em</label><input id="symptom-name" maxlength="60" required><label class="save-symptom"><input id="remember-symptom" type="checkbox"> Lưu triệu chứng vào gợi ý cho các ngày sau</label><p id="symptom-error" role="alert"></p><button class="primary">Thêm biểu hiện</button></form>');
      $("#symptom-name").focus();
      $("#add-symptom-form").onsubmit = async event => {
        event.preventDefault();
        const s = $("#symptom-name").value.trim();
        const remember = $("#remember-symptom").checked;
        if (!s) return $("#symptom-error").textContent = "Hãy nhập biểu hiện của em.";
        if ((!activeSymptoms.includes(s) && activeSymptoms.length >= 50) || (remember && !suggestions.includes(s) && suggestions.length >= 50)) return $("#symptom-error").textContent = "Có thể lưu tối đa 50 biểu hiện.";
        if (remember && !suggestions.includes(s)) {
          const previous = state.symptomSuggestions;
          state.symptomSuggestions = [...suggestions, s];
          if (!(await persist())) { state.symptomSuggestions = previous; return; }
        }
        if (!activeSymptoms.includes(s)) activeSymptoms.push(s);
        $("#dialog").close();
        draw();
      };
    };
  };
  title.querySelector("button").onclick = event => {
    editing = !editing;
    event.currentTarget.setAttribute("aria-pressed", editing);
    draw();
  };
  draw();
}
function handlePeriodAction(day) {
  const existing = periodContaining(state,day,todayKey);
  if (existing && !existing.ongoing) return editPeriodDialog(existing.start);
  const active = ongoingPeriod(state,todayKey);
  if (active && day >= active.start) return savePeriodChange(current => finishPeriod(current,active.start,todayKey,todayKey), todayKey);
  return savePeriodChange(current => beginPeriod(current,day,todayKey), day);
}
function renderPeriodControls() {
  const existing = periodContaining(state,selected,todayKey);
  const active = ongoingPeriod(state,todayKey);
  const ending = active && selected >= active.start;
  const recorded = existing && !existing.ongoing;
  const completed = recorded && Boolean(state.ends[existing.start]);
  const estimated = completed && Boolean(state.periodEstimates?.[existing.start]);
  const future = selected > todayKey;
  const panel = document.createElement("div");
  panel.className = "period-action-panel";
  panel.innerHTML = `<button class="primary" id="selected-period-action" ${future ? "disabled" : ""}>${recorded ? "Chỉnh sửa kỳ kinh" : ending ? "Kết thúc kỳ kinh" : "Ghi nhận kỳ kinh"}</button><p>${future ? "Ngày tương lai chỉ hiển thị dự kiến. Em có thể ghi nhận khi ngày đó đến." : completed ? `Đã hoàn tất · ${existing.start} → ${existing.end} · ${periodDayCount(existing.start,existing.end)} ngày hành kinh` : recorded ? `Đã ghi ngày bắt đầu ${existing.start}. Em bổ sung ngày kết thúc để tính thời gian hành kinh thực tế nhé.` : ending ? `Đang ghi nhận từ ${active.start} · ${periodDayCount(active.start,todayKey)} ngày. Nhấn kết thúc để lấy hôm nay làm ngày cuối cùng.` : "Ghi nhận ngày đang chọn là ngày bắt đầu kỳ kinh."}</p>${existing ? '<button class="text-button" id="adjust-period-range">Sửa khoảng ngày</button> <button class="text-button" id="remove-selected-period">Xóa khoảng đã ghi</button>' : ""}`;
  if (estimated) panel.querySelector("p").textContent = `Kết thúc theo ước tính · ${existing.start} → ${existing.end} · ${periodDayCount(existing.start, existing.end)} ngày. Em có thể chỉnh sửa để xác nhận ngày kết thúc thực tế.`;
  $(".day-details > b").after(panel);
  panel.querySelector("#selected-period-action").onclick = async event => { event.target.disabled = true; await handlePeriodAction(selected); if(event.target.isConnected) event.target.disabled = future; };
  if (existing) {
    panel.querySelector("#adjust-period-range").onclick = () => editPeriodDialog(existing.start);
    panel.querySelector("#remove-selected-period").onclick = () => confirmRemovePeriod(existing.start);
  }
  const charts = document.createElement("div");
  charts.innerHTML = renderCycleCharts(analyzeCycles(state,todayKey));
  $(".day-details").after(charts);

}
function managePeriodsDialog() {
  openDialog(`<h2>Các kỳ kinh đã ghi nhận</h2>${state.starts.length ? [...state.starts].sort().reverse().map(start => `<div class="period-history"><b>Bắt đầu: ${escape(start)}</b><p>${state.ends[start] ? `Kết thúc: ${escape(state.ends[start])} · ${periodDayCount(start,state.ends[start])} ngày` : "Chưa ghi nhận ngày kết thúc"}</p><button class="small-button" data-edit-period="${start}">Chỉnh sửa</button> <button class="text-button" data-remove-period="${start}">Xóa kỳ kinh</button></div>`).join("") : "<p>Chưa có kỳ kinh được ghi nhận.</p>"}`);
  document.querySelectorAll("[data-edit-period]").forEach(button => button.onclick = () => editPeriodDialog(button.dataset.editPeriod));
  document.querySelectorAll("[data-remove-period]").forEach(button => button.onclick = () => confirmRemovePeriod(button.dataset.removePeriod));
}
function confirmRemovePeriod(start) {
  openDialog(`<h2>Xóa kỳ kinh này?</h2><p>Xóa khoảng ngày bắt đầu từ ${escape(start)}. Nhật ký vẫn được giữ.</p><button class="primary" id="confirm-remove-period">Xóa kỳ kinh</button>`);
  $("#confirm-remove-period").onclick = () => savePeriodChange(current => removePeriod(current,start));
}
function editPeriodDialog(editStart, proposedStart, proposedEnd) {
  const start = editStart || proposedStart;
  const end = editStart ? (state.ends[editStart] > todayKey ? "" : state.ends[editStart] || "") : proposedEnd || "";
  openDialog(`<h2>${editStart ? "Chỉnh sửa kỳ kinh" : "Ghi nhận kỳ kinh"}</h2><form id="edit-period-form"><label class="form-label" for="actual-period-start">Ngày bắt đầu</label><input type="date" id="actual-period-start" required max="${todayKey}" value="${start}"><label class="form-label" for="actual-period-end">Ngày kết thúc</label><input type="date" id="actual-period-end" min="${start}" max="${todayKey}" value="${end}"><p>Ngày đầu và ngày cuối đều được tính. Để trống ngày kết thúc nếu kỳ kinh vẫn tiếp tục. Các khoảng trùng hoặc liền nhau sẽ được gộp.</p><button class="primary">Lưu thay đổi</button></form>`);
  $("#actual-period-start").oninput = event => { $("#actual-period-end").min = event.target.value; };
  $("#edit-period-form").onsubmit = async event => {
    event.preventDefault();
    const from = $("#actual-period-start").value, to = $("#actual-period-end").value;
    if (to && to < from) return toast("Ngày kết thúc phải từ ngày bắt đầu trở đi.");
    await savePeriodChange(current => {
      const base = editStart ? removePeriod(current,editStart) : current;
      return to ? recordPeriodRange(base,from,to,todayKey) : beginPeriod(base,from,todayKey);
    }, from);
  };
}
function renderJournal() {
  $("#main").innerHTML =
    `<div class="page-intro"><div class="eyebrow">NHỮNG ĐIỀU EM MUỐN NHỚ</div><h1>Nhật ký của em ${icon("clover")}</h1><p>Một chút cảm xúc, một chút lắng nghe mỗi ngày.</p></div>${
      Object.keys(state.entries).length
        ? Object.keys(state.entries)
            .sort()
            .reverse()
            .map((d) => {
              const e = state.entries[d];
              return `<article class="card entry"><h3>${parse(d).toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3><span class="pill">${escape(e.mood || "Một ngày của em")}</span> ${(e.symptoms || []).map((x) => `<span class="pill">${escape(x)}</span>`).join(" ")}<p>${escape(e.note || "Em đã dành một chút thời gian để lắng nghe mình.")}</p><button class="text-button" data-delete="${d}">Xóa ghi chú</button></article>`;
            })
            .join("")
        : `<div class="card empty"><img src="assets/Cute.png" alt="Cô gái dễ thương"><h3>Trang nhỏ đang chờ em</h3><p>Ghi lại cảm xúc hôm nay để sau này nhìn lại nhé.</p><button class="primary" id="write-today">Viết cho hôm nay</button></div>`
    }`;
  if ($("#write-today"))
    $("#write-today").onclick = () => {
      selected = todayKey;
      month = new Date(today.getFullYear(), today.getMonth(), 1, 12);
      view = "calendar";
      render();
      $("#note").focus();
    };
  document.querySelectorAll(".entry").forEach(article => {
    const date = article.querySelector("[data-delete]").dataset.delete;
    const entry = state.entries[date];
    const button = document.createElement("button");
    button.className = "small-button journal-sharing";
    button.textContent = entry.shared ? "Ẩn nhật ký với Anh" : "Hiện nhật ký với Anh";
    button.setAttribute("aria-pressed", String(Boolean(entry.shared)));
    button.onclick = async () => {
      button.disabled = true;
      const enabled = !entry.shared;
      try {
        if (cloud?.user) await cloud.changeEntrySharing(date, enabled);
        else { entry.shared = enabled; if (!(await persist())) return; renderJournal(); }
        toast(enabled ? "Đã chia sẻ trang nhật ký này với Anh ♡" : "Đã ẩn nhật ký với Anh.");
      } catch (error) { toast(error.message); }
      finally { if (button.isConnected) button.disabled = false; }
    };
    article.append(button);
  });
  document.querySelectorAll("[data-delete]").forEach(
    (b) =>
      (b.onclick = () => {
        openDialog(
          '<h2>Xóa ghi chú này?</h2><p>Ghi chú sẽ được xóa khỏi thiết bị.</p><button class="primary" id="delete-entry">Xóa ghi chú</button>',
        );
        $("#delete-entry").onclick = async () => {
          delete state.entries[b.dataset.delete];
          if (await persist()) {
            $("#dialog").close();
            renderJournal();
            toast("Đã xóa ghi chú.");
          }
        };
      }),
  );
}
function renderConnect() {
  if (!cloud) {
    $("#main").innerHTML = "<p>Đang khởi tạo bộ nhớ…</p>";
    return;
  }
  return renderConnections({
    cloud,
    main: $("#main"),
    escape,
    open: openDialog,
    close: () => $("#dialog").close(),
    toast,
    login: openAccount,
    pendingInvite,
  });
}
function settingsDialog() {
  if (cloud?.user?.role === "anh") return openAccount();
  openDialog(`<h2>Tên gọi thân thương</h2><label class="form-label" for="name">Mình gọi em là</label><input id="name" maxlength="24" required value="${escape(state.name)}"><button class="primary" id="save-settings">Lưu tên gọi</button>`);
  $("#save-settings").onclick=async()=>{
    const name=$("#name").value.trim();
    if(!name||name.length>24)return toast("Em nhập tên từ 1 đến 24 ký tự nhé.");
    state.name=name;
    if(await persist()){$("#dialog").close();render();toast("Đã lưu tên gọi của Em.");}
  };
}
$("#settings").onclick = settingsDialog;
$("#profile").onclick = openAccount;
document.querySelector(".brand").onclick = (e) => {
  e.preventDefault();
  view = "home";
  render();
};
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
});
$("#install").onclick = async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    installPrompt = null;
  } else
    openDialog(
      "<h2>Mang Cho Em bên mình ♡</h2><p><b>iPhone / iPad:</b> Mở bằng Safari, chọn Chia sẻ → Thêm vào màn hình chính.</p><p><b>Android / máy tính:</b> Mở menu trình duyệt, chọn Cài đặt ứng dụng hoặc Thêm vào màn hình chính.</p><p>Sau lần mở đầu tiên, em có thể ghi nhật ký và xem chu kỳ khi không có mạng. Khi chưa đăng nhập, dữ liệu chỉ nằm trên trình duyệt. Khi đăng nhập, các thay đổi được đồng bộ lên tài khoản khi có mạng.</p>",
    );
};
init();
