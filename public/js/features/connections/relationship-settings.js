import { api } from "../../core/api.js";

export async function appendRelationshipSettings({
  container,
  cloud,
  escape,
  toast,
}) {
  const section = document.createElement("section");
  section.className = "relationship-settings";
  container.append(section);
  if (!cloud?.user) {
    section.innerHTML =
      "<h3>Ngày bên nhau</h3><p>Đăng nhập và kết nối với người ấy để đặt ngày bên nhau.</p>";
    return;
  }
  section.innerHTML = '<p role="status">Đang tải ngày bên nhau…</p>';
  try {
    const { connections } = await api("/connections");
    if (!section.isConnected) return;
    const link = connections.find(
      (item) =>
        item.role === (cloud.user.role === "anh" ? "companion" : "owner"),
    );
    if (!link) {
      section.innerHTML =
        "<h3>Ngày bên nhau</h3><p>Kết nối với người ấy trong mục Người đồng hành để cùng đặt ngày này.</p>";
      return;
    }
    let envelope;
    const load = async () => {
      const input = section.querySelector("#relationship-start");
      const submit = section.querySelector('[type="submit"]');
      input.disabled = true;
      submit.disabled = true;
      try {
        const latest = await api(`/connections/${link.id}/space`);
        if (!section.isConnected) return;
        envelope = latest;
        section.querySelector("#relationship-start").value =
          latest.space.anniversary || "";
        section.querySelector(".relationship-settings-status").textContent = "";
      } catch (error) {
        if (section.isConnected)
          section.querySelector(".relationship-settings-status").textContent =
            error.message;
      } finally {
        input.disabled = !envelope;
        submit.disabled = !envelope;
      }
    };
    section.innerHTML =
      '<h3>Ngày bên nhau</h3><p>Ô đếm ngày chỉ xuất hiện trong mục Người đồng hành khi đã chọn ngày. Để trống để ẩn ô này ở cả hai tài khoản.</p><form id="relationship-settings-form"><label class="form-label" for="relationship-start">Ngày bắt đầu bên nhau</label><input type="date" id="relationship-start" min="1900-01-01" max="2199-12-31"><div class="relationship-settings-actions"><button type="submit" class="small-button">Lưu ngày bên nhau</button><button type="button" class="text-button" data-relationship-reload>Tải ngày mới nhất</button></div><p class="relationship-settings-status" role="status" aria-live="polite"></p></form>';
    await load();
    if (!section.isConnected) return;
    section.querySelector("[data-relationship-reload]").onclick = load;
    const form = section.querySelector("form");
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!envelope || form.dataset.saving === "true") return;
      const input = section.querySelector("#relationship-start");
      const anniversary = input.value || null;
      const controls = form.querySelectorAll("input,button");
      controls.forEach((control) => {
        control.disabled = true;
      });
      form.dataset.saving = "true";
      try {
        const saved = await api(`/connections/${link.id}/space`, {
          method: "PATCH",
          body: {
            revision: envelope.revision,
            anniversary,
          },
        });
        if (!section.isConnected) return;
        envelope = saved;
        section.querySelector(".relationship-settings-status").textContent =
          saved.space.anniversary
            ? "Đã lưu ngày bên nhau ♡"
            : "Đã ẩn ô đếm ngày ở cả hai tài khoản.";
        document.dispatchEvent(
          new CustomEvent("relationship:updated", {
            detail: { connectionId: link.id },
          }),
        );
        toast("Đã lưu cài đặt ngày bên nhau.");
      } catch (error) {
        if (section.isConnected)
          section.querySelector(".relationship-settings-status").textContent =
            error.message;
      } finally {
        controls.forEach((control) => {
          control.disabled = false;
        });
        delete form.dataset.saving;
      }
    };
  } catch (error) {
    if (section.isConnected)
      section.innerHTML = `<p role="alert">${escape(error.message)}</p>`;
  }
}
