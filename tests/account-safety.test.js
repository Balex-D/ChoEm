import assert from "node:assert/strict";
import { test } from "node:test";
import { Cloud } from "../public/js/core/cloud.js";
import { api, setApiAccount } from "../public/js/core/api.js";
import { parseBackup } from "../shared/backup.js";
import { reminderCalendar } from "../shared/reminders.js";
import { stateSchema } from "../server/build/modules/sync/schema.js";
import { vietnamDay } from "../shared/dates.js";
import { sendAccountEmail } from "../server/build/modules/auth/email.js";

const snapshot = () => ({
  name: "Em",
  starts: ["2026-01-01"],
  ends: { "2026-01-01": "2026-01-05" },
  periodEstimates: {},
  entries: {
    "2026-01-02": {
      mood: "Vui vẻ",
      symptoms: [],
      note: "private",
      shared: true,
    },
  },
  symptomSuggestions: [],
  privacy: { cycle: true, mood: false, notes: true, symptoms: false },
});

test("account header is pinned and responses from an old account are discarded", async (t) => {
  t.after(() => setApiAccount(null));
  let release, seen;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    seen = options.headers;
    await pending;
    return Response.json({ state: snapshot() });
  });
  setApiAccount("account-a");
  const request = api("/state");
  setApiAccount("account-b");
  release();
  await assert.rejects(request, (error) => error.code === "ACCOUNT_CHANGED");
  assert.equal(seen["X-Cho-Em-Account"], "account-a");
});

test("suspended tabs cannot save or send authenticated requests; login remains available", async (t) => {
  t.after(() => setApiAccount(null));
  const cloud = new Cloud(
    { set: async () => assert.fail("Must not persist stale edits") },
    { status() {} },
  );
  cloud.user = { id: "a" };
  cloud.envelope = { state: snapshot(), revision: 0 };
  cloud.suspend();
  await assert.rejects(cloud.save(snapshot()), /đăng nhập lại/);
  await assert.rejects(
    api("/state"),
    (error) => error.code === "ACCOUNT_CHANGED",
  );
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.headers["X-Cho-Em-Account"], undefined);
    return Response.json({ user: {} });
  });
  await api("/auth/login", { anonymous: true, method: "POST", body: {} });
});

test("initial state fetch failure is retried without losing account identity", async (t) => {
  t.after(() => setApiAccount(null));
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  t.after(() => delete navigator.onLine);
  let requests = 0,
    rendered;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    if (requests === 1) throw new Error("offline");
    return Response.json({ state: snapshot(), revision: 0 });
  });
  const data = new Map();
  const cloud = new Cloud(
    {
      get: async (key) => data.get(key),
      set: async (key, value) => data.set(key, value),
    },
    {
      status() {},
      empty: snapshot,
      canRefresh: () => true,
      remote: (value) => {
        rendered = value;
      },
    },
  );
  await cloud.attach({ id: "a" });
  assert.equal(cloud.user.id, "a");
  assert.equal(cloud.envelope, undefined);
  await cloud.sync();
  assert.equal(requests, 2);
  assert.equal(cloud.envelope.revision, 0);
  assert.deepEqual(rendered, snapshot());
  assert.ok(data.has("account:a"));
});

test("backup schema validates data and defaults all imported journals to private", () => {
  const parsed = parseBackup(
    JSON.stringify({ state: snapshot() }),
    "2026-02-01",
  );
  assert.equal(parsed.summary.entries, 1);
  assert.equal(parsed.state.entries["2026-01-02"].shared, false);
  assert.equal(parsed.state.privacy.notes, false);
  assert.equal(stateSchema.safeParse(parsed.state).success, true);
  for (const change of [
    (s) => s.starts.push("2026-02-30"),
    (s) => (s.entries["2026-01-02"].note = "x".repeat(2001)),
    (s) => (s.ends["2026-01-01"] = "2026-02-30"),
    (s) => (s.periodEstimates["2026-01-01"] = 1.5),
  ]) {
    const s = snapshot();
    change(s);
    assert.throws(() =>
      parseBackup(JSON.stringify({ state: s }), "2026-02-01"),
    );
  }
  assert.throws(() => parseBackup("not json"));
  assert.throws(() => parseBackup(" ".repeat(2 * 1024 * 1024 + 1)));
});

test("Vietnam date and calendar reminder use inclusive forecast dates without journal contents", () => {
  assert.equal(vietnamDay(new Date("2026-01-01T18:00:00Z")), "2026-01-02");
  const calendar = reminderCalendar(
    snapshot(),
    2,
    new Date("2026-01-15T00:00:00Z"),
  );
  assert.match(calendar, /DTSTART;VALUE=DATE:20260129\r\n/);
  assert.match(calendar, /DTEND;VALUE=DATE:20260130\r\n/);
  assert.match(calendar, /TRIGGER:-P2D/);
  assert.match(calendar, /CLASS:PRIVATE/);
  assert.equal(calendar.includes("private"), false);
  assert.throws(
    () => reminderCalendar(snapshot(), 2, new Date("2026-02-01T00:00:00Z")),
    /cập nhật/,
  );
});

test("Resend email carries only account link and no journal data; configuration fails closed", async (t) => {
  let sent;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    sent = JSON.parse(options.body);
    return Response.json({ id: "test" });
  });
  const config = {
    APP_ORIGIN: "https://example.com",
    RESEND_API_KEY: "test-key",
    EMAIL_FROM: "Cho Em <mail@example.com>",
  };
  await sendAccountEmail(config, "person@example.com", "reset", "a".repeat(64));
  assert.deepEqual(sent.to, ["person@example.com"]);
  assert.ok(sent.text.includes("https://example.com/#reset="));
  assert.equal(sent.text.includes("private"), false);
  await assert.rejects(
    sendAccountEmail(
      { ...config, RESEND_API_KEY: "" },
      "person@example.com",
      "reset",
      "a".repeat(64),
    ),
    (error) => error.code === "EMAIL_UNAVAILABLE",
  );
});
