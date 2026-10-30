import { api } from "./api.js";
const clone = (x) => structuredClone(x);
export class Cloud {
  user = null;
  expired = false;
  envelope = null;
  conflict = null;
  busy = null;
  status = "Chỉ trên thiết bị";
  sequence = 0;
  constructor(storage, hooks) {
    this.storage = storage;
    this.hooks = hooks;
  }
  changed(status) {
    if (status) this.status = status;
    this.hooks.status(this.status, this.user);
  }
  async start() {
    try {
      const { user } = await api("/auth/me");
      await this.attach(user);
    } catch (e) {
      if (e.status === 0) {
        const user = await this.storage.get("last-account");
        if (user) {
          const saved = await this.storage.get("account:" + user.id);
          if (saved) {
            this.user = user;
            this.envelope = saved;
            this.hooks.remote(clone(saved.state));
          }
        }
        this.changed("Ngoại tuyến · lưu trên thiết bị");
      } else
        this.changed(
          e.status === 401 ? "Chỉ trên thiết bị" : "Backend chưa sẵn sàng",
        );
    }
    window.addEventListener("online", () => void this.sync());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void this.sync();
    });
    this.timer = setInterval(() => {
      if (!document.hidden) void this.sync();
    }, 30000);
  }
  async attach(user) {
    this.user = user;
    this.expired = false;
    this.conflict = null;
    await this.storage.set("last-account", user);
    this.envelope = await this.storage.get("account:" + user.id);
    if (this.envelope) {
      this.hooks.remote(clone(this.envelope.state));
      await this.sync();
    } else {
      const result = await api("/state");
      this.envelope = { ...result, dirty: false };
      await this.storage.set("account:" + user.id, this.envelope);
      this.hooks.remote(clone(result.state));
      this.changed("Đã đồng bộ");
    }
  }
  async authenticate(mode, input) {
    const { user } = await api("/auth/" + mode, {
      method: "POST",
      body: input,
    });
    await this.attach(user);
  }
  async save(state) {
    if (!this.user) {
      await this.storage.set("state", clone(state));
      return;
    }
    if (!this.envelope) throw new Error("Chưa tải xong dữ liệu tài khoản.");
    this.envelope = { ...this.envelope, state: clone(state), dirty: true };
    this.sequence++;
    await this.storage.set("account:" + this.user.id, this.envelope);
    this.changed("Đã lưu thiết bị · chờ đồng bộ");
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.sync(), 500);
  }
  async sync() {
    if (this.busy) return this.busy;
    if (!this.user || !this.envelope || this.conflict) return;
    if (!navigator.onLine) {
      this.changed("Ngoại tuyến · chờ đồng bộ");
      return;
    }
    this.busy = this.perform().finally(() => {
      this.busy = null;
    });
    return this.busy;
  }
  async perform() {
    const userId = this.user.id;
    try {
      this.changed("Đang đồng bộ…");
      let forecastsUpdated = false;
      while (this.user?.id === userId && this.envelope.dirty) {
        const seq = this.sequence,
          snapshot = clone(this.envelope.state),
          revision = this.envelope.revision;
        const saved = await api("/state", {
          method: "PUT",
          body: { state: snapshot, revision },
        });
        if (this.user?.id !== userId) return;
        this.envelope.revision = saved.revision;
        if (Array.isArray(saved.forecasts)) {
          forecastsUpdated ||=
            JSON.stringify(this.envelope.state.forecasts || []) !==
            JSON.stringify(saved.forecasts);
          this.envelope.state.forecasts = clone(saved.forecasts);
          const local = this.hooks.local?.();
          if (local) local.forecasts = clone(saved.forecasts);
        }
        this.envelope.dirty = seq !== this.sequence;
        await this.storage.set("account:" + userId, this.envelope);
      }
      if (this.user?.id !== userId) return;
      if (!this.envelope.dirty && this.hooks.canRefresh()) {
        const seq = this.sequence,
          remote = await api("/state");
        if (this.user?.id !== userId) return;
        if (
          seq === this.sequence &&
          !this.envelope.dirty &&
          remote.revision !== this.envelope.revision
        ) {
          this.envelope = { ...remote, dirty: false };
          await this.storage.set("account:" + userId, this.envelope);
          this.hooks.remote(clone(remote.state));
        }
      }
      this.changed(this.envelope.dirty ? "Chờ đồng bộ" : "Đã đồng bộ");
      if (forecastsUpdated && this.hooks.canRefresh() && !this.envelope.dirty)
        this.hooks.remote(clone(this.envelope.state));
    } catch (e) {
      if (this.user?.id !== userId) return;
      if (e.code === "SYNC_CONFLICT") {
        this.conflict = e.details;
        this.changed("Có xung đột · mở Tài khoản");
      } else if (e.status === 401) {
        this.expired = true;
        this.changed("Phiên hết hạn · đăng nhập lại");
      } else
        this.changed(e.status === 0 ? "Ngoại tuyến · chờ đồng bộ" : e.message);
    }
  }
  async resolveConflict(keepLocal) {
    if (!this.user || !this.conflict) return;
    const fresh = await api("/state");
    await this.storage.set(
      "backup:" + this.user.id + ":" + Date.now(),
      clone(this.envelope),
    );
    if (keepLocal) {
      this.envelope.revision = fresh.revision;
      this.envelope.dirty = true;
      this.conflict = null;
      await this.storage.set("account:" + this.user.id, this.envelope);
      await this.sync();
    } else {
      this.envelope = { ...fresh, dirty: false };
      this.conflict = null;
      await this.storage.set("account:" + this.user.id, this.envelope);
      this.hooks.remote(clone(fresh.state));
      this.changed("Đã nhận bản trên máy chủ");
    }
  }
  async importGuest() {
    if (!this.user || !this.envelope)
      throw new Error("Vui lòng đăng nhập và tải xong dữ liệu.");
    const guest = await this.storage.get("state");
    if (!guest) throw new Error("Không có dữ liệu khách để nhập.");
    await this.storage.set(
      "backup:" + this.user.id + ":" + Date.now(),
      clone(this.envelope),
    );
    const imported = { ...guest, privacy: { ...this.envelope.state.privacy } };
    await this.save(imported);
    this.hooks.remote(clone(imported));
    await this.sync();
  }
  async changePrivacy(privacy, { hideExistingJournals = false } = {}) {
    if (!this.user || !navigator.onLine)
      throw new Error("Cần đăng nhập và có mạng để thay đổi quyền chia sẻ.");
    await this.sync();
    if (this.conflict || this.envelope.dirty)
      throw new Error("Hãy xử lý đồng bộ trước khi đổi quyền chia sẻ.");
    const result = await api("/state/privacy", {
      method: "PATCH",
      body: { revision: this.envelope.revision, privacy, hideExistingJournals },
    });
    this.envelope = { ...result, dirty: false };
    await this.storage.set("account:" + this.user.id, this.envelope);
    this.hooks.remote(clone(result.state));
    this.changed("Đã cập nhật quyền chia sẻ");
  }
  async changeEntrySharing(date, shared) {
    if (!this.user || !navigator.onLine)
      throw new Error("Cần đăng nhập và có mạng để đổi quyền nhật ký.");
    await this.sync();
    if (this.conflict || this.envelope.dirty)
      throw new Error("Hãy xử lý đồng bộ trước khi đổi quyền nhật ký.");
    const result = await api("/state/entries/" + date + "/sharing", {
      method: "PATCH",
      body: { revision: this.envelope.revision, shared },
    });
    this.envelope = { ...result, dirty: false };
    await this.storage.set("account:" + this.user.id, this.envelope);
    this.hooks.remote(clone(result.state));
    this.changed("Đã cập nhật quyền nhật ký");
  }
  exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      state: this.envelope?.state || this.hooks.local(),
      serverConflict: this.conflict?.state || null,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "cho-em-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async logout() {
    if (!this.user) return;
    await this.sync();
    if (this.conflict || this.envelope?.dirty)
      throw new Error(
        "Dữ liệu còn chờ đồng bộ. Hãy xử lý xung đột hoặc kết nối mạng trước khi đăng xuất.",
      );
    await api("/auth/logout", { method: "POST", body: {} });
    const id = this.user.id;
    await this.storage.removeAccount(id);
    await this.storage.set("last-account", null);
    this.user = null;
    this.envelope = null;
    this.conflict = null;
    this.hooks.remote((await this.storage.get("state")) || this.hooks.empty());
    this.changed("Chỉ trên thiết bị");
  }
}
