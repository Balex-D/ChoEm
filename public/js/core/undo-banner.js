export class UndoBanner {
  constructor() {
    this.clear();
  }
  clear() {
    clearTimeout(this.timer);
    this.element?.remove();
    this.element = null;
    this.record = null;
  }
  show(record, label, action) {
    this.clear();
    this.record = record;
    const element = document.createElement("aside");
    element.id = "undo-banner";
    element.setAttribute("aria-label", "Hoàn tác thao tác gần nhất");
    const message = document.createElement("span");
    message.setAttribute("role", "status");
    message.textContent = label + " · Có thể hoàn tác trong 1 phút.";
    const button = document.createElement("button");
    button.className = "small-button";
    button.textContent = "Hoàn tác";
    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    button.onclick = async () => {
      button.disabled = true;
      try {
        await action(record);
        this.clear();
      } catch (e) {
        error.textContent = e.message;
        button.disabled = false;
      }
    };
    element.append(message, button, error);
    document.body.append(element);
    this.element = element;
    this.timer = setTimeout(
      () => this.clear(),
      Math.max(0, record.expiresAt - Date.now()),
    );
  }
}
