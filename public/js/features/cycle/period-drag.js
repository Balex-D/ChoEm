// Pointer events share one gesture path for mouse, touch and pen.
export function attachPeriodDrag({
  root,
  today,
  anchorForDay,
  onCommit,
  onMonth,
  canStart = () => true,
  onError = () => {},
}) {
  const controller = new AbortController();
  const options = { signal: controller.signal };
  let gesture = null,
    hold,
    edgeTimer,
    direction = 0,
    suppressUntil = 0;
  const paint = () => {
    const removing = Boolean(
      gesture?.active && gesture.moved && gesture.editStart && gesture.current === gesture.start,
    );
    const range = gesture?.active
      ? [gesture.start, gesture.current].sort()
      : null;
    root.querySelectorAll("[data-day]").forEach((button) => {
      const day = button.dataset.day;
      button.classList.toggle(
        "period-preview",
        Boolean(range && !removing && day >= range[0] && day <= range[1]),
      );
      button.classList.toggle(
        "period-preview-removed",
        Boolean(
          range &&
          gesture.editStart &&
          day >= gesture.start &&
          day <= gesture.oldEnd &&
          (removing || day < range[0] || day > range[1]),
        ),
      );
    });
    root.querySelector("#period-drag-status")?.remove();
    if (range) {
      const status = document.createElement("p");
      status.id = "period-drag-status";
      status.className = "period-drag-status";
      status.setAttribute("role", "status");
      status.textContent = `${range[0]} → ${range[1]} · Thả tay để lưu`;
      root.querySelector(".calendar-card")?.append(status);
      if (removing) status.textContent = "Thả tay để xóa kỳ kinh";
    }
  };
  const stopEdge = () => {
    clearTimeout(edgeTimer);
    direction = 0;
  };
  const clear = () => {
    clearTimeout(hold);
    stopEdge();
    if (gesture && root.hasPointerCapture?.(gesture.id))
      root.releasePointerCapture(gesture.id);
    gesture = null;
    root.classList.remove("period-dragging");
    paint();
  };
  const activate = () => {
    if (!gesture || !canStart()) return clear();
    gesture.active = true;
    root.classList.add("period-dragging");
    root.setPointerCapture?.(gesture.id);
    paint();
  };
  const edge = (next) => {
    if (next === direction) return;
    stopEdge();
    direction = next;
    if (!next) return;
    const turn = () => {
      if (!gesture?.active) return;
      const day = onMonth(next);
      if (!day) return stopEdge();
      gesture.current = day;
      gesture.moved = true;
      paint();
      edgeTimer = setTimeout(turn, 800);
    };
    edgeTimer = setTimeout(turn, 650);
  };
  root.addEventListener(
    "pointerdown",
    (event) => {
      const button = event.target.closest("[data-day]");
      if (
        !button ||
        !root.contains(button) ||
        event.button !== 0 ||
        event.isPrimary === false ||
        !canStart() ||
        button.dataset.day > today
      )
        return;
      clear();
      const anchor = anchorForDay(button.dataset.day);
      gesture = {
        id: event.pointerId,
        origin: button.dataset.day,
        start: anchor.start,
        current: button.dataset.day,
        oldEnd: anchor.end,
        editStart: anchor.editStart,
        x: event.clientX,
        y: event.clientY,
        active: false,
        moved: false,
      };
      hold = setTimeout(activate, 350);
    },
    options,
  );
  window.addEventListener(
    "pointermove",
    (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const moved =
        Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8;
      if (!gesture.active && moved) {
        if (event.pointerType === "mouse") {
          clearTimeout(hold);
          activate();
        } else {
          clear();
          return;
        }
      }
      if (!gesture?.active) return;
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const button = target?.closest("[data-day]");
      if (button && root.contains(button)) {
        gesture.current =
          button.dataset.day > today ? today : button.dataset.day;
        gesture.moved ||= gesture.current !== gesture.origin;
        paint();
      }
      const bounds = root
        .querySelector(".calendar-card .days")
        ?.getBoundingClientRect();
      const inside =
        bounds &&
        event.clientY >= bounds.top - 35 &&
        event.clientY <= bounds.bottom + 20;
      edge(
        target?.closest("#prev-month")
          ? -1
          : target?.closest("#next-month")
            ? 1
            : inside && event.clientX <= bounds.left + 10
              ? -1
              : inside && event.clientX >= bounds.right - 10
                ? 1
                : 0,
      );
    },
    { ...options, passive: false },
  );
  window.addEventListener(
    "pointerup",
    (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const saved = { ...gesture };
      if (saved.active) suppressUntil = Date.now() + 500;
      clear();
      if (saved.active && (saved.moved || !saved.editStart))
        Promise.resolve()
          .then(() => onCommit(saved.start, saved.current, saved.editStart))
          .catch(onError);
    },
    options,
  );
  window.addEventListener("pointercancel", clear, options);
  window.addEventListener("blur", clear, options);
  window.addEventListener("pagehide", clear, options);
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        if (gesture?.active) suppressUntil = Date.now() + 500;
        clear();
      }
    },
    options,
  );
  root.addEventListener(
    "contextmenu",
    (event) => {
      if (gesture) event.preventDefault();
    },
    options,
  );
  root.addEventListener(
    "click",
    (event) => {
      if (Date.now() < suppressUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { ...options, capture: true },
  );
  return () => {
    clear();
    controller.abort();
  };
}
