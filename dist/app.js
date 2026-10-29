import { Cloud } from "./js/cloud.js";
import { accountDialog } from "./js/account.js";
import { renderConnections } from "./js/connections.js";
let cloud;
let pendingInvite = /^#invite=([a-f0-9]{64})$/.exec(location.hash)?.[1] || "";
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
  `<span class="icon"><svg viewBox="0 0 24 24">${paths[n] || paths.heart}</svg></span>`;
const moods = [
  ["Cute", "Vui vẻ"],
  ["OmTim", "Yêu đời"],
  ["Sleepy", "Mệt mỏi"],
  ["Cry", "Buồn chút"],
  ["Angry", "Cáu kỉnh"],
  ["XauHo", "Nhạy cảm"],
];
const symptoms = ["Đau bụng", "Đau lưng", "Đau đầu", "Căng ngực"];
const today = new Date();
today.setHours(12, 0, 0, 0);
const key = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayKey = key(today);
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
  length: 28,
  duration: 5,
  symptomSuggestions: [...symptoms],
  starts: [],
  ends: {},
  entries: {},
  privacy: { cycle: true, mood: false, notes: false },
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
      canRefresh: () => !$("#dialog").open && !hasUnsavedDraft(),
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
      JSON.stringify([...(e.symptoms || [])].sort())
  );
}
async function persist() {
  try {
    if (!cloud) throw new Error("Chưa khởi tạo bộ nhớ.");
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
  for (const id of ["nav", "mobile-nav"]) {
    $("#" + id).innerHTML = tabs
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
  const start = state.starts
    .filter((x) => x <= todayKey)
    .sort()
    .at(-1);
  if (!start) return { exists: false };
  const elapsed = diff(today, parse(start)),
    day = elapsed + 1;
  const next = add(parse(start), state.length);
  const remain = diff(next, today);
  const ended = state.ends[start];
  const inPeriod = !ended && day <= state.duration;
  return { exists: true, start, day, next, remain, inPeriod };
}
function dayType(d) {
  const k = key(d);
  for (const start of state.starts) {
    const elapsed = diff(d, parse(start));
    let duration = state.ends[start]
      ? diff(parse(state.ends[start]), parse(start)) + 1
      : state.duration;
    if (elapsed >= 0 && elapsed < duration)
      return k > todayKey ? "predicted" : "period";
  }
  const latest = state.starts
    .filter((x) => x <= k)
    .sort()
    .at(-1);
  if (latest) {
    const offset = diff(d, parse(latest));
    if (offset >= state.length && offset < state.length + state.duration)
      return "predicted";
    if (offset === state.length - 14) return "ovulation";
  }
  return "";
}
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
function bindCalendar() {
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
}
function render() {
  renderNav();
  if (view === "home") renderHome();
  if (view === "calendar") renderCalendar();
  if (view === "journal") renderJournal();
  if (view === "connect") renderConnect();
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
    `<div class="greeting"><div><div class="eyebrow">MỘT CHÚT QUAN TÂM MỖI NGÀY</div><h1>Chào ${escape(state.name)}, ngày mới dịu dàng <span>✳</span></h1><p>Cơ thể đang kể chuyện, mình cùng lắng nghe nhé.</p></div><div class="date-tag">${icon("calendar")}${date}</div></div><div class="dashboard-grid"><section class="card cycle-card"><div class="card-top"><span>Chu kỳ của em</span><span class="pill">${c.exists ? (c.inPeriod ? "♡ Đang trong kỳ kinh" : "✿ Nhịp điệu của em") : "♡ Bắt đầu làm quen"}</span></div><div class="cycle-center"><div class="cycle-text"><p>${c.exists ? (c.inPeriod ? "Hôm nay là ngày thứ" : c.remain >= 0 ? "Kỳ kinh dự kiến sau" : "Kỳ kinh dự kiến đã qua") : "Mình cùng"}</p><h2>${c.exists ? (c.inPeriod ? c.day : Math.abs(c.remain)) : "hiểu em"} ${c.exists && !c.inPeriod ? "<span>ngày</span>" : ""}</h2><p>${c.exists ? (c.inPeriod ? "Nghỉ ngơi một chút cũng được." : "Thương mình hơn một chút nhé!") : "từng ngày một nhé! ♡"}</p><div class="next-date">${c.exists ? `Ngày ${c.day} của chu kỳ · Kỳ tiếp theo: ${c.next.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}` : "Ghi lại kỳ kinh đầu tiên để bắt đầu."}</div></div><img class="hero-sticker" src="assets/OmTim.png" alt="Cô gái ôm trái tim hồng"><span class="spark">✧</span><span class="scribble">gửi em một chiếc ôm ♡</span></div><button class="primary" id="period-action">${icon("calendar")} ${c.exists && c.inPeriod ? "Ghi nhận kết thúc kỳ kinh" : c.exists ? "Ghi nhận kỳ kinh mới" : "Ghi nhận ngày bắt đầu"}</button><p class="cycle-note">${c.exists ? "Ước tính có thể thay đổi theo nhịp điệu cơ thể." : "Chỉ một chạm để bắt đầu chăm sóc mình."}</p></section>${calendar()}</div><div class="section-title"><h2>Hôm nay em cảm thấy thế nào?</h2><span>Cảm xúc nào cũng đáng được ôm ♡</span></div><section class="card mood-box"><div class="mood-options">${moods.map(([img, label]) => `<button class="mood-option ${activeMood === label ? "chosen" : ""}" data-mood="${label}" aria-pressed="${activeMood === label}"><img src="assets/${img}.png" alt=""><span>${label}</span>${activeMood === label ? '<b class="mood-check">✓</b>' : ""}</button>`).join("")}</div></section><div class="lower-grid"><section class="card care-card"><h3 class="mini-title">✧ Một chút dịu dàng</h3><p>Không cần phải luôn tràn đầy năng lượng.<br>Một cốc nước ấm, một khoảng nghỉ nhỏ.<br>Hôm nay, cứ nhẹ nhàng với mình thôi.</p><button id="care-link">Ghé góc người đồng hành ↗</button><img src="assets/HoldPhone.png" alt="Cô gái cầm điện thoại"></section></div><div class="privacy-note">${icon("lock")} ${cloud?.user ? "Góc nhỏ riêng tư. Dữ liệu được đồng bộ theo tài khoản của em." : "Góc nhỏ riêng tư. Dữ liệu của em được lưu trên thiết bị này."}</div>`;
  bindCalendar();
  $("#period-action").onclick = () =>
    periodDialog(c.exists && c.inPeriod ? "end" : "start", todayKey);
  document.querySelectorAll("[data-mood]").forEach(
    (b) =>
      (b.onclick = async () => {
        activeMood = b.dataset.mood;
        state.entries[todayKey] = {
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
function periodDialog(type, date) {
  openDialog(
    `<h2>${type === "start" ? "Một chu kỳ mới ♡" : "Em đã thấy nhẹ hơn chưa?"}</h2><p>${type === "start" ? "Chọn ngày đầu tiên của kỳ kinh. Mình sẽ ghi nhớ giúp em." : "Ghi lại ngày cuối cùng của kỳ kinh này."}</p><label class="form-label" for="period-date">${type === "start" ? "Ngày bắt đầu" : "Ngày kết thúc"}</label><input id="period-date" type="date" value="${date}" max="${todayKey}"><button class="primary" id="confirm-period">Lưu ngày ${type === "start" ? "bắt đầu" : "kết thúc"}</button>`,
  );
  $("#confirm-period").onclick = async () => {
    const d = $("#period-date").value;
    if (!d || d > todayKey)
      return toast("Em hãy chọn ngày hôm nay hoặc trước đó nhé.");
    if (type === "start") {
      if (!state.starts.includes(d)) state.starts.push(d);
      state.starts.sort();
    } else {
      const s = state.starts
        .filter((x) => x <= d)
        .sort()
        .at(-1);
      if (!s) return toast("Chưa có ngày bắt đầu trước ngày này.");
      state.ends[s] = d;
    }
    if (await persist()) {
      $("#dialog").close();
      render();
      toast("Đã ghi lại chu kỳ của em ♡");
    }
  };
}
function renderCalendar() {
  const c = cycleInfo(),
    e = state.entries[selected] || {};
  activeSymptoms = [...(e.symptoms || [])];
  const type = dayType(parse(selected));
  $("#main").innerHTML =
    `<div class="page-intro"><div class="eyebrow">NHỊP ĐIỆU RIÊNG CỦA EM</div><h1>Lịch chu kỳ <span>✿</span></h1><p>Mỗi dấu nhỏ là một cách hiểu cơ thể hơn.</p></div><div class="stat-grid"><div class="card stat"><b>${state.length} ngày</b><span>Độ dài chu kỳ đã cài đặt</span></div><div class="card stat"><b>${state.duration} ngày</b><span>Thời gian kỳ kinh đã cài đặt</span></div><div class="card stat"><b>${c.exists ? c.day : "—"}</b><span>Ngày hiện tại của chu kỳ</span></div></div>${calendar(true)}<section class="card day-details"><b>${parse(selected).toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b>${type === "predicted" ? "<p>Ngày kinh dự kiến, chưa được ghi nhận.</p>" : type === "ovulation" ? "<p>Ngày rụng trứng ước tính theo chu kỳ đã cài đặt.</p>" : ""}<div class="note-card day-body-record"><h3 class="mini-title">${icon("pen")} Lắng nghe cơ thể</h3><div class="symptoms"></div><textarea id="note" aria-label="Ghi chú trạng thái cơ thể" rows="2" maxlength="2000">${escape(e.note || "")}</textarea><div class="note-bottom"><span>${cloud?.user ? (state.privacy.notes ? "Ghi chú đang bật chia sẻ ♡" : "Ghi chú đang để riêng tư ♡") : "Chỉ lưu trên thiết bị này ♡"}</span><button class="small-button" id="save-note">Lưu ghi chú ↗</button></div></div>${selected <= todayKey ? '<button class="small-button" id="log-selected">Ghi nhận bắt đầu kỳ kinh</button>' : ""} <button class="text-button" id="cycle-settings">Điều chỉnh chu kỳ ↗</button></section><p class="privacy-note">Dự đoán chỉ mang tính tham khảo, không dùng làm biện pháp tránh thai.</p>`;
  bindCalendar();
  bindSymptoms();
  $("#save-note").onclick = async () => {
    state.entries[selected] = {
      ...(state.entries[selected] || {}),
      symptoms: [...activeSymptoms],
      note: $("#note").value,
    };
    if (await persist()) {
      renderCalendar();
      toast("Đã cất ghi chú vào nhật ký ♡");
    }
  };
  if ($("#log-selected"))
    $("#log-selected").onclick = () => periodDialog("start", selected);
  $("#cycle-settings").onclick = settingsDialog;
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
function renderJournal() {
  $("#main").innerHTML =
    `<div class="page-intro"><div class="eyebrow">NHỮNG ĐIỀU EM MUỐN NHỚ</div><h1>Nhật ký của em ♡</h1><p>Một chút cảm xúc, một chút lắng nghe mỗi ngày.</p></div>${
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
  openDialog(
    `<h2>Một góc rất riêng ♡</h2><p>Điều chỉnh để Cho Em hiểu nhịp điệu của em hơn.</p><label class="form-label" for="name">Mình gọi em là</label><input id="name" maxlength="24" value="${escape(state.name)}"><label class="form-label" for="length">Độ dài chu kỳ (ngày)</label><input id="length" type="number" min="15" max="90" value="${state.length}"><label class="form-label" for="duration">Số ngày hành kinh</label><input id="duration" type="number" min="1" max="15" value="${state.duration}"><p>Ban đầu dùng 28 ngày / 5 ngày để ước tính. Em có thể thay đổi theo chu kỳ của mình.</p><button class="primary" id="save-settings">Lưu thay đổi</button>`,
  );
  $("#save-settings").onclick = async () => {
    const l = Number($("#length").value),
      d = Number($("#duration").value);
    if (
      !Number.isInteger(l) ||
      l < 15 ||
      l > 90 ||
      !Number.isInteger(d) ||
      d < 1 ||
      d > 15 ||
      d >= l
    )
      return toast("Em kiểm tra lại số ngày chu kỳ nhé.");
    state.name = $("#name").value.trim() || "Em";
    state.length = l;
    state.duration = d;
    if (await persist()) {
      $("#dialog").close();
      render();
      toast("Đã lưu cài đặt của em ♡");
    }
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
