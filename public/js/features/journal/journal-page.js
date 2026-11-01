export function renderJournalPage({
  state,
  cloud,
  icon,
  parse,
  escape,
  persist,
  renderJournal,
  openDialog,
  toast,
  writeToday,
}) {
  const $ = (selector) => document.querySelector(selector);
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
      writeToday();
    };
  document.querySelectorAll(".entry").forEach((article) => {
    const date = article.querySelector("[data-delete]").dataset.delete;
    const entry = state.entries[date];
    const button = document.createElement("button");
    button.className = "small-button journal-sharing";
    button.textContent = entry.shared
      ? "Ẩn nhật ký với Anh"
      : "Hiện nhật ký với Anh";
    button.setAttribute("aria-pressed", String(Boolean(entry.shared)));
    button.onclick = async () => {
      button.disabled = true;
      const enabled = !entry.shared;
      try {
        if (cloud?.user) await cloud.changeEntrySharing(date, enabled);
        else {
          entry.shared = enabled;
          if (!(await persist())) return;
          renderJournal();
        }
        toast(
          enabled
            ? "Đã chia sẻ trang nhật ký này với Anh ♡"
            : "Đã ẩn nhật ký với Anh.",
        );
      } catch (error) {
        toast(error.message);
      } finally {
        if (button.isConnected) button.disabled = false;
      }
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
