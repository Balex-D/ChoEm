import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { request } from "./request.js";
import type { Database, Queryable } from "../src/db/database.js";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { hashToken } from "../src/common/security.js";
// @ts-ignore Shared deterministic analysis.
import { analyzeCycles } from "../../dist/js/cycle-analysis.js";
import {
  issueInvite,
  generateInviteCode,
} from "../src/modules/connections/invites.js";
import jsQR from "jsqr";
// @ts-ignore pngjs is the PNG reader used by the existing qrcode dependency.
import { PNG } from "pngjs";
// @ts-ignore Shared browser parser; no DOM needed for QR verification.
import { parseConnectionCode } from "../../dist/js/connection-code.js";
const origin = "http://localhost:8080",
  password = "test-password-12345";
let engine: PGlite, db: Database, app: ReturnType<typeof createApp>;
const query =
  (client: any): Queryable["query"] =>
  async (sql, values) => {
    if (!values && sql.includes(";")) {
      await client.exec(sql);
      return { rows: [] };
    }
    return client.query(sql, values);
  };
before(async () => {
  engine = new PGlite();
  await engine.waitReady;
  db = {
    query: query(engine),
    transaction: (fn) => engine.transaction((tx) => fn({ query: query(tx) })),
    close: () => engine.close(),
  };
  await migrate(db);
  await migrate(db);
  app = createApp(db, {
    NODE_ENV: "test",
    PORT: 8080,
    APP_ORIGIN: origin,
    DATABASE_URL: "test",
    TRUST_PROXY_HOPS: 0,
  });
});
after(async () => {
  await db.close();
});
beforeEach(async () => {
  await engine.exec("TRUNCATE users CASCADE; TRUNCATE rate_limits;");
});
const mutate = (agent: any, method: string, url: string, body: any = {}) =>
  agent[method](url).set("Origin", origin).set("X-Cho-Em", "1").send(body);
async function user(email: string, role = "em") {
  const agent = request.agent(app);
  const response = await mutate(agent, "post", "/api/auth/register", {
    email,
    password,
    name: "Em",
    role,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { agent, id: response.body.user.id };
}
function sample() {
  return {
    name: "Em",
    length: 28,
    duration: 5,
    starts: ["2025-01-01"],
    ends: { "2025-01-01": "2025-01-05" },
    entries: {
      "2025-01-01": {
        mood: "Vui vẻ",
        symptoms: ["Đau bụng"],
        note: "riêng tư",
      },
    },
    privacy: { cycle: false, mood: false, notes: false },
  };
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
test("authentication, CSRF and secure response defaults", async () => {
  assert.equal((await request(app).get("/api/state")).status, 401);
  assert.equal(
    (await request(app).post("/api/auth/register").send({})).status,
    403,
  );
  const rejected = await request(app)
    .post("/api/auth/register")
    .set("Origin", "https://evil.example")
    .set("X-Cho-Em", "1")
    .send({});
  assert.equal(rejected.status, 403);
  const { agent } = await user("a@example.com");
  const me = await agent.get("/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.headers["cache-control"], "no-store");
  assert.ok(me.headers["content-security-policy"]);
  const cookies = await mutate(request(app), "post", "/api/auth/login", {
    email: "a@example.com",
    password,
  });
  assert.match(String(cookies.headers["set-cookie"]), /HttpOnly/);
  assert.match(String(cookies.headers["set-cookie"]), /SameSite=Strict/);
  assert.equal(
    (
      await mutate(request(app), "post", "/api/auth/login", {
        email: "a@example.com",
        password: "incorrect-password",
      })
    ).status,
    401,
  );
});
test("passwords require at least six characters", async () => {
  const agent = request.agent(app);
  const credentials = { email: "short@example.com", password: "12345" };
  assert.equal(
    (await mutate(agent, "post", "/api/auth/register", credentials)).status,
    400,
  );
  credentials.password = "123456";
  assert.equal(
    (await mutate(agent, "post", "/api/auth/register", credentials)).status,
    201,
  );
  assert.equal(
    (await mutate(request(app), "post", "/api/auth/login", credentials)).status,
    200,
  );
  assert.equal(
    (
      await mutate(agent, "post", "/api/auth/change-password", {
        currentPassword: credentials.password,
        newPassword: "abcde",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await mutate(agent, "post", "/api/auth/change-password", {
        currentPassword: credentials.password,
        newPassword: "abcdef",
      })
    ).status,
    204,
  );
});

test("roles restrict invitations and custom symptom suggestions survive sync", async () => {
  const em = await user("em@example.com");
  const anh = await user("anh@example.com", "anh");
  assert.equal((await anh.agent.get("/api/auth/me")).body.user.role, "anh");
  assert.equal(
    (await mutate(anh.agent, "post", "/api/connections/invites")).status,
    403,
  );
  assert.equal(
    (
      await mutate(em.agent, "post", "/api/connections/accept", {
        token: "a".repeat(64),
      })
    ).status,
    403,
  );
  const state = {
    ...sample(),
    symptomSuggestions: ["Chóng mặt"],
    entries: { [today()]: { mood: "", symptoms: ["Chóng mặt"], note: "" } },
  };
  assert.equal(
    (await mutate(em.agent, "put", "/api/state", { revision: 0, state }))
      .status,
    200,
  );
  const saved = (await em.agent.get("/api/state")).body.state;
  assert.deepEqual(saved.symptomSuggestions, ["Chóng mặt"]);
  assert.equal(
    (
      await mutate(em.agent, "put", "/api/state", {
        revision: 1,
        state: { ...saved, symptomSuggestions: [] },
      })
    ).status,
    200,
  );
  const removed = (await em.agent.get("/api/state")).body.state;
  assert.deepEqual(removed.symptomSuggestions, []);
  assert.deepEqual(removed.entries[today()].symptoms, ["Chóng mặt"]);
  const invite = await mutate(em.agent, "post", "/api/connections/invites");
  assert.equal(
    (
      await mutate(anh.agent, "post", "/api/connections/accept", {
        token: invite.body.token,
      })
    ).status,
    201,
  );
  assert.equal(
    (await mutate(anh.agent, "patch", "/api/auth/role", { role: "em" })).status,
    409,
  );
});

test("tenant isolation, atomic revision checks, deletion and reconnect", async () => {
  const a = await user("a@example.com"),
    b = await user("b@example.com");
  const initial = await a.agent.get("/api/state");
  assert.equal(initial.body.revision, 0);
  assert.equal(initial.body.state.privacy.notes, false);
  assert.equal(
    (
      await mutate(a.agent, "put", "/api/state", {
        revision: 0,
        state: sample(),
      })
    ).status,
    200,
  );
  assert.deepEqual((await b.agent.get("/api/state")).body.state.entries, {});
  const stale = await mutate(a.agent, "put", "/api/state", {
    revision: 0,
    state: { ...sample(), entries: {} },
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, "SYNC_CONFLICT");
  assert.ok(stale.body.error.details.state.entries["2025-01-01"]);
  assert.equal(
    (
      await mutate(a.agent, "put", "/api/state", {
        revision: 1,
        state: { ...sample(), entries: {}, starts: [], ends: {} },
      })
    ).status,
    200,
  );
  const restored = await a.agent.get("/api/state");
  assert.deepEqual(restored.body.state.entries, {});
  assert.deepEqual(restored.body.state.starts, []);
});
test("validation rejects impossible dates, future cycles, overlaps and invalid notes", async () => {
  const { agent } = await user("a@example.com");
  for (const bad of [
    { ...sample(), starts: ["2025-02-30"], ends: {} },
    { ...sample(), starts: ["2199-01-01"], ends: {} },
    { ...sample(), starts: ["2025-01-01", "2025-01-03"] },
    { ...sample(), ends: { "2025-02-01": "2025-02-03" } },
    { ...sample(), entries: { "2025-01-01": { note: "x".repeat(2001) } } },
  ])
    assert.equal(
      (await mutate(agent, "put", "/api/state", { revision: 0, state: bad }))
        .status,
      400,
    );
  assert.equal((await agent.get("/api/state")).body.revision, 0);
});
test("legacy settings are ignored and forecast evidence is server-owned and preserved before a new start", async () => {
  const { agent, id } = await user("automatic-analysis@example.com");
  const initial = {
    ...sample(),
    length: 90,
    duration: 15,
    starts: ["2025-01-01", "2025-01-29"],
    ends: { "2025-01-01": "2025-01-05", "2025-01-29": "2025-02-02" },
    forecasts: [
      {
        anchor: "2025-01-29",
        start: "2025-02-01",
        end: "2025-02-02",
        issuedAt: "2020-01-01T00:00:00Z",
      },
    ],
  };
  const saved = await mutate(agent, "put", "/api/state", {
    revision: 0,
    state: initial,
  });
  assert.equal(saved.status, 200);
  const read = await agent.get("/api/state");
  assert.equal("length" in read.body.state, false);
  assert.equal("duration" in read.body.state, false);
  assert.equal(read.body.state.forecasts[0].start, "2025-02-26");
  assert.ok(
    Date.parse(read.body.state.forecasts[0].issuedAt) >
      Date.parse("2020-01-01"),
  );
  const issued = read.body.state.forecasts[0].issuedAt;
  assert.equal(
    (await agent.get("/api/state")).body.state.forecasts[0].issuedAt,
    issued,
  );
  await db.query("UPDATE cycle_forecasts SET issued_at=$2 WHERE user_id=$1", [
    id,
    "2025-02-01T12:00:00Z",
  ]);
  const next = {
    ...initial,
    starts: [...initial.starts, "2025-03-01"],
    ends: { ...initial.ends, "2025-03-01": "2025-03-05" },
  };
  assert.equal(
    (await mutate(agent, "put", "/api/state", { revision: 1, state: next }))
      .status,
    200,
  );
  const actual = (await agent.get("/api/state")).body.state;
  assert.match(analyzeCycles(actual, today()).timingNotice, /muộn.*3 ngày/);
  assert.equal(
    actual.forecasts.find((item: any) => item.anchor === "2025-01-29").issuedAt,
    "2025-02-01T12:00:00.000Z",
  );
  assert.equal(
    (await mutate(agent, "put", "/api/state", { revision: 2, state: initial }))
      .status,
    200,
  );
  assert.equal(
    (await agent.get("/api/state")).body.state.forecasts.some(
      (item: any) => item.anchor === "2025-03-01",
    ),
    false,
  );
});

test("single-use hashed invites; privacy enforced before sending companion data", async () => {
  const a = await user("a@example.com"),
    b = await user("b@example.com", "anh"),
    third = await user("third@example.com", "anh");
  const date = today(),
    state = {
      ...sample(),
      entries: {
        [date]: {
          mood: "Mệt mỏi",
          symptoms: ["Đau đầu"],
          note: "sensitive-note",
          shared: false,
        },
      },
    };
  await mutate(a.agent, "put", "/api/state", { revision: 0, state });
  const invite = await mutate(a.agent, "post", "/api/connections/invites");
  assert.equal(invite.status, 201);
  assert.match(invite.body.qr, /^data:image\/png;base64,/);
  const stored = await db.query("SELECT token_hash FROM connection_invites");
  assert.equal(stored.rows[0].token_hash, hashToken(invite.body.token));
  assert.notEqual(stored.rows[0].token_hash, invite.body.token);
  assert.equal(
    (
      await mutate(a.agent, "post", "/api/connections/accept", {
        token: invite.body.token,
      })
    ).status,
    403,
  );
  const accepted = await mutate(b.agent, "post", "/api/connections/accept", {
    token: invite.body.token,
  });
  assert.equal(accepted.status, 201);
  const id = accepted.body.id;
  assert.equal(
    (
      await mutate(third.agent, "post", "/api/connections/accept", {
        token: invite.body.token,
      })
    ).status,
    404,
  );
  const route = `/api/connections/${id}/summary?date=${date}`;
  const hidden = await b.agent.get(route);
  assert.equal(hidden.status, 200);
  for (const key of ["cycle", "mood", "note", "symptoms"])
    assert.equal(key in hidden.body.summary, false);
  assert.equal((await third.agent.get(route)).status, 404);
  assert.equal((await a.agent.get(route)).status, 404);
  await mutate(a.agent, "patch", "/api/state/privacy", {
    revision: 1,
    privacy: { cycle: true, mood: true, notes: true },
  });
  await mutate(a.agent, "patch", `/api/state/entries/${date}/sharing`, {
    revision: 2,
    shared: true,
  });
  const shown = await b.agent.get(route);
  assert.equal(shown.body.summary.note, "sensitive-note");
  assert.equal(shown.body.summary.mood, "Mệt mỏi");
  assert.ok(shown.body.summary.cycle);
  assert.equal(shown.headers["cache-control"], "no-store");
  assert.equal(
    (await b.agent.get(`/api/connections/${id}/summary?date=2025-01-01`))
      .status,
    400,
  );
  await mutate(a.agent, "patch", "/api/state/privacy", {
    revision: 3,
    privacy: { cycle: false, mood: false, notes: false },
    hideExistingJournals: true,
  });
  assert.equal("note" in (await b.agent.get(route)).body.summary, false);
  assert.equal(
    (await mutate(third.agent, "delete", "/api/connections/" + id)).status,
    404,
  );
  assert.equal(
    (await mutate(a.agent, "delete", "/api/connections/" + id)).status,
    204,
  );
  assert.equal((await b.agent.get(route)).status, 404);
});
test("journal default can be disabled while keeping old shares or hiding them atomically", async () => {
  const em = await user("journal-default-em@example.com");
  const anh = await user("journal-default-anh@example.com", "anh");
  const initial = {
    ...sample(),
    privacy: { cycle: false, mood: false, symptoms: false, notes: true },
    entries: {
      "2025-01-03": {
        mood: "",
        symptoms: [],
        note: "old-shared",
        shared: true,
      },
      "2025-01-04": {
        mood: "",
        symptoms: [],
        note: "private-override",
        shared: false,
      },
    },
  };
  assert.equal(
    (
      await mutate(em.agent, "put", "/api/state", {
        revision: 0,
        state: initial,
      })
    ).status,
    200,
  );
  const invite = await mutate(em.agent, "post", "/api/connections/invites");
  const linked = await mutate(anh.agent, "post", "/api/connections/accept", {
    code: invite.body.code,
  });
  const route = `/api/connections/${linked.body.id}/shared?month=2025-01`;
  const disabled = await mutate(em.agent, "patch", "/api/state/privacy", {
    revision: 1,
    privacy: { ...initial.privacy, notes: false },
  });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.state.privacy.notes, false);
  assert.deepEqual(
    (await anh.agent.get(route.replace("2025-01", "2025-02"))).body.shared
      .journal,
    [],
  );
  assert.deepEqual(
    (await anh.agent.get(route)).body.shared.journal.map(
      (entry: any) => entry.note,
    ),
    ["old-shared"],
  );
  assert.equal(disabled.body.state.entries["2025-01-04"].shared, false);
  const hide = await mutate(em.agent, "patch", "/api/state/privacy", {
    revision: 2,
    privacy: { ...initial.privacy, notes: false },
    hideExistingJournals: true,
  });
  assert.equal(hide.status, 200);
  assert.equal(hide.body.state.entries["2025-01-03"].note, "old-shared");
  assert.equal(hide.body.state.entries["2025-01-03"].shared, false);
  assert.equal("journal" in (await anh.agent.get(route)).body.shared, false);
  assert.equal(
    (
      await mutate(em.agent, "patch", "/api/state/privacy", {
        revision: 2,
        privacy: { ...initial.privacy, notes: false },
        hideExistingJournals: true,
      })
    ).status,
    409,
  );
  const enabled = await mutate(em.agent, "patch", "/api/state/privacy", {
    revision: 3,
    privacy: initial.privacy,
  });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.state.entries["2025-01-03"].shared, false);
  assert.equal((await anh.agent.get(route)).body.shared.journal.length, 0);
  assert.equal(
    (
      await mutate(em.agent, "patch", "/api/state/privacy", {
        revision: 4,
        privacy: initial.privacy,
        hideExistingJournals: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await mutate(em.agent, "patch", "/api/state/entries/2025-01-03/sharing", {
        revision: 4,
        shared: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await anh.agent.get(route)).body.shared.journal[0].note,
    "old-shared",
  );
});

test("monthly companion data enforces independent permissions and per-entry journal visibility", async () => {
  const em = await user("monthly-em@example.com");
  const anh = await user("monthly-anh@example.com", "anh");
  const outsider = await user("monthly-other@example.com", "anh");
  const state = {
    ...sample(),
    starts: ["2024-12-04", "2025-01-01"],
    ends: { "2024-12-04": "2024-12-13", "2025-01-01": "2025-01-10" },
    privacy: { cycle: true, mood: true, symptoms: true, notes: true },
    entries: {
      "2025-01-03": {
        mood: "Vui vẻ",
        symptoms: ["Đau đầu"],
        note: "public-entry",
        shared: true,
      },
      "2025-01-04": {
        mood: "Mệt mỏi",
        symptoms: ["Đau bụng"],
        note: "NEVER-SEND-PRIVATE-NOTE",
        shared: false,
      },
    },
  };
  assert.equal(
    (await mutate(em.agent, "put", "/api/state", { revision: 0, state }))
      .status,
    200,
  );
  const invite = await mutate(em.agent, "post", "/api/connections/invites");
  const linked = await mutate(anh.agent, "post", "/api/connections/accept", {
    code: invite.body.code,
  });
  const route = `/api/connections/${linked.body.id}/shared?month=2025-01`;
  assert.equal((await request(app).get(route)).status, 401);
  assert.equal((await outsider.agent.get(route)).status, 404);
  assert.equal((await em.agent.get(route)).status, 404);
  const response = await anh.agent.get(route);
  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(
    JSON.stringify(response.body).includes("NEVER-SEND-PRIVATE-NOTE"),
    false,
  );
  assert.equal(
    response.body.shared.calendar.find((d: any) => d.date === "2025-01-09")
      .type,
    "period",
  );
  assert.equal(
    response.body.shared.calendar.find((d: any) => d.date === "2025-01-15")
      .type,
    "ovulation",
  );
  assert.equal(
    response.body.shared.calendar.find((d: any) => d.date === "2025-01-29")
      .type,
    "predicted",
  );
  assert.equal(response.body.shared.journal.length, 1);
  assert.equal(response.body.shared.moods["2025-01-04"], "Mệt mỏi");
  const hidden = await mutate(
    em.agent,
    "patch",
    "/api/state/entries/2025-01-03/sharing",
    { revision: 1, shared: false },
  );
  assert.equal(hidden.status, 200);
  assert.equal((await anh.agent.get(route)).body.shared.journal.length, 0);
  assert.equal(
    (
      await mutate(em.agent, "patch", "/api/state/entries/2025-01-03/sharing", {
        revision: 1,
        shared: true,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await mutate(
        outsider.agent,
        "patch",
        "/api/state/entries/2025-01-03/sharing",
        { revision: 0, shared: true },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await mutate(em.agent, "patch", "/api/state/entries/2025-01-03/sharing", {
        revision: 2,
        shared: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await mutate(em.agent, "patch", "/api/state/privacy", {
        revision: 3,
        privacy: { cycle: false, mood: false, symptoms: false, notes: true },
      })
    ).status,
    200,
  );
  const journalOnly = (await anh.agent.get(route)).body.shared;
  assert.equal("calendar" in journalOnly, false);
  assert.equal("moods" in journalOnly, false);
  assert.equal("symptoms" in journalOnly, false);
  assert.equal("mood" in journalOnly.journal[0], false);
  assert.equal("symptoms" in journalOnly.journal[0], false);
  assert.equal(
    (await anh.agent.get(route.replace("2025-01", "2025-13"))).status,
    400,
  );
  const saved = (await em.agent.get("/api/state")).body;
  const removed = { ...saved.state, starts: [], ends: {} };
  assert.equal(
    (
      await mutate(em.agent, "put", "/api/state", {
        revision: saved.revision,
        state: removed,
      })
    ).status,
    200,
  );
  assert.equal(
    Object.keys((await em.agent.get("/api/state")).body.state.entries).length,
    2,
  );
});

test("QR round trip validates UUID and code before linking; duplicate links are rejected", async () => {
  const em = await user("qr-em@example.com");
  const otherEm = await user("qr-other@example.com");
  const anh = await user("qr-anh@example.com", "anh");
  const secondAnh = await user("qr-anh2@example.com", "anh");
  const invite = await mutate(em.agent, "post", "/api/connections/invites");
  const image = PNG.sync.read(
    Buffer.from(invite.body.qr.split(",")[1], "base64"),
  );
  const decoded = jsQR(
    new Uint8ClampedArray(image.data),
    image.width,
    image.height,
  );
  assert.ok(decoded);
  const payload = parseConnectionCode(decoded.data, origin);
  assert.equal(payload.ownerId, undefined);
  assert.ok(!decoded.data.includes(em.id));
  assert.equal(payload.code, invite.body.token);
  assert.equal(invite.body.ownerId, undefined);
  assert.equal(
    (
      await mutate(anh.agent, "post", "/api/connections/accept", {
        ...payload,
        ownerId: otherEm.id,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await mutate(anh.agent, "post", "/api/connections/accept", {
        ...payload,
        ownerId: "invalid",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await mutate(anh.agent, "post", "/api/connections/accept", {
        code: "a".repeat(64),
      })
    ).status,
    400,
  );
  const linked = await mutate(
    anh.agent,
    "post",
    "/api/connections/accept",
    payload,
  );
  assert.equal(linked.status, 201);
  assert.equal(
    (await mutate(anh.agent, "post", "/api/connections/accept", payload))
      .status,
    404,
  );
  assert.equal(
    (await mutate(secondAnh.agent, "post", "/api/connections/accept", payload))
      .status,
    404,
  );
  assert.equal(
    (await mutate(em.agent, "post", "/api/connections/invites")).status,
    409,
  );
  const otherInvite = await mutate(
    otherEm.agent,
    "post",
    "/api/connections/invites",
  );
  const otherPayload = { ownerId: otherEm.id, code: otherInvite.body.code };
  assert.equal(
    (await mutate(anh.agent, "post", "/api/connections/accept", otherPayload))
      .status,
    409,
  );
  assert.equal(
    (
      await mutate(
        secondAnh.agent,
        "post",
        "/api/connections/accept",
        otherPayload,
      )
    ).status,
    201,
  );
  assert.equal((await db.query("SELECT id FROM connections")).rows.length, 2);
  assert.equal(
    (await anh.agent.get("/api/connections")).body.connections.length,
    1,
  );
  assert.equal(
    (await em.agent.get("/api/connections")).body.connections[0].role,
    "owner",
  );
});

test("six-character codes retry collisions and preserve existing invites on exhaustion", async () => {
  const first = await user("collision-em1@example.com");
  const second = await user("collision-em2@example.com");
  const expiry = new Date(Date.now() + 15 * 60000);
  await db.transaction((q) => issueInvite(q, first.id, expiry, () => "K7M9X2"));
  let attempts = 0;
  const code = await db.transaction((q) =>
    issueInvite(q, second.id, expiry, () =>
      ++attempts <= 2 ? "K7M9X2" : "ABC123",
    ),
  );
  assert.equal(code, "ABC123");
  assert.equal(attempts, 3);
  const rows = (
    await db.query(
      "SELECT token_hash,owner_id FROM connection_invites ORDER BY token_hash",
    )
  ).rows;
  assert.equal(rows.length, 2);
  assert.equal(
    rows.find((row) => row.token_hash === hashToken("K7M9X2"))?.owner_id,
    first.id,
  );
  await assert.rejects(
    db.transaction((q) => issueInvite(q, second.id, expiry, () => "K7M9X2")),
    (error: any) => error.code === "INVITE_UNAVAILABLE",
  );
  assert.equal(
    (
      await db.query(
        "SELECT token_hash FROM connection_invites WHERE owner_id=$1",
        [second.id],
      )
    ).rows[0].token_hash,
    hashToken("ABC123"),
  );
  for (let i = 0; i < 100; i++)
    assert.match(generateInviteCode(), /^[A-Z0-9]{6}$/);
});

test("short manual codes normalize case and whitespace; UUID and expiry remain unchanged", async () => {
  const em = await user("short-em@example.com");
  const anh = await user("short-anh@example.com", "anh");
  const invite = await mutate(em.agent, "post", "/api/connections/invites");
  assert.match(invite.body.code, /^[A-Z0-9]{6}$/);
  assert.equal(invite.body.ownerId, undefined);
  const remaining = Date.parse(invite.body.expiresAt) - Date.now();
  assert.ok(remaining > 1 * 60000 && remaining <= 2 * 60000);
  assert.equal(
    (
      await mutate(anh.agent, "post", "/api/connections/accept", {
        code: ` ${invite.body.code.toLowerCase()} `,
      })
    ).status,
    201,
  );
  assert.equal((await em.agent.get("/api/auth/me")).body.user.id, em.id);
  assert.equal(
    (
      await mutate(anh.agent, "post", "/api/connections/accept", {
        code: invite.body.code,
      })
    ).status,
    404,
  );
});

test("guessing is limited by both account and IP without leaking whether an Em exists", async () => {
  const first = await user("limited-anh1@example.com", "anh");
  const second = await user("limited-anh2@example.com", "anh");
  for (let i = 0; i < 10; i++) {
    const response = await mutate(
      first.agent,
      "post",
      "/api/connections/accept",
      { code: "ZZZZZZ" },
    );
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "INVITE_EXPIRED");
  }
  const limited = await mutate(first.agent, "post", "/api/connections/accept", {
    code: "ZZZZZZ",
  });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers["retry-after"]) > 0);
  for (let i = 0; i < 4; i++)
    assert.equal(
      (
        await mutate(second.agent, "post", "/api/connections/accept", {
          code: "ZZZZZZ",
        })
      ).status,
      404,
    );
  assert.equal(
    (
      await mutate(second.agent, "post", "/api/connections/accept", {
        code: "ZZZZZZ",
      })
    ).status,
    429,
  );
  await engine.exec(
    "UPDATE rate_limits SET reset_at=now()-interval '1 minute'",
  );
  assert.equal(
    (
      await mutate(first.agent, "post", "/api/connections/accept", {
        code: "ZZZZZZ",
      })
    ).status,
    404,
  );
});

test("previous long invitation codes remain usable until expiry", async () => {
  const em = await user("legacy-em@example.com");
  const anh = await user("legacy-anh@example.com", "anh");
  const token = "a".repeat(64);
  await db.query(
    "INSERT INTO connection_invites(token_hash,owner_id,expires_at) VALUES($1,$2,now()+interval '15 minutes')",
    [hashToken(token), em.id],
  );
  assert.equal(
    (
      await mutate(anh.agent, "post", "/api/connections/accept", {
        ownerId: em.id,
        code: token,
      })
    ).status,
    201,
  );
});

test("simultaneous QR requests consume one invitation only", async () => {
  const em = await user("race-em@example.com");
  const first = await user("race-first@example.com", "anh");
  const second = await user("race-second@example.com", "anh");
  const invite = await mutate(em.agent, "post", "/api/connections/invites");
  const payload = { ownerId: em.id, code: invite.body.code };
  const results = await Promise.all([
    mutate(first.agent, "post", "/api/connections/accept", payload),
    mutate(second.agent, "post", "/api/connections/accept", payload),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 404]);
  assert.equal((await db.query("SELECT id FROM connections")).rows.length, 1);
  assert.equal(
    (await db.query("SELECT token_hash FROM connection_invites")).rows.length,
    0,
  );
});

test("revoked and expired invitations cannot connect", async () => {
  const a = await user("a@example.com"),
    b = await user("b@example.com", "anh");
  const first = await mutate(a.agent, "post", "/api/connections/invites");
  const second = await mutate(a.agent, "post", "/api/connections/invites");
  assert.equal(
    (
      await mutate(b.agent, "post", "/api/connections/accept", {
        token: first.body.token,
      })
    ).status,
    404,
  );
  await db.query(
    "UPDATE connection_invites SET expires_at=now()-interval '1 minute'",
  );
  assert.equal(
    (
      await mutate(b.agent, "post", "/api/connections/accept", {
        token: second.body.token,
      })
    ).status,
    404,
  );
  const third = await mutate(a.agent, "post", "/api/connections/invites");
  await mutate(a.agent, "delete", "/api/connections/invites");
  assert.equal(
    (
      await mutate(b.agent, "post", "/api/connections/accept", {
        token: third.body.token,
      })
    ).status,
    404,
  );
});
test("password change revokes other sessions; logout invalidates its cookie", async () => {
  const { agent } = await user("a@example.com"),
    other = request.agent(app);
  await mutate(other, "post", "/api/auth/login", {
    email: "a@example.com",
    password,
  });
  assert.equal(
    (
      await mutate(agent, "post", "/api/auth/change-password", {
        currentPassword: password,
        newPassword: "a-different-password",
      })
    ).status,
    204,
  );
  assert.equal((await other.get("/api/auth/me")).status, 401);
  assert.equal((await agent.get("/api/auth/me")).status, 200);
  await mutate(agent, "post", "/api/auth/logout");
  assert.equal((await agent.get("/api/auth/me")).status, 401);
});
test("two writes from the same base revision cannot silently overwrite one another", async () => {
  const { agent } = await user("a@example.com");
  const responses = await Promise.all([
    mutate(agent, "put", "/api/state", { revision: 0, state: sample() }),
    mutate(agent, "put", "/api/state", {
      revision: 0,
      state: { ...sample(), name: "Changed" },
    }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await agent.get("/api/state")).body.revision, 1);
});
test("API rate limit persists in the database", async () => {
  // Test the actual app middleware without repeatedly running expensive password hashes.
  const bucket = hashToken("api:::ffff:127.0.0.1");
  await db.query(
    "INSERT INTO rate_limits(bucket,attempts,reset_at) VALUES($1,800,now()+interval '15 minutes')",
    [bucket],
  );
  const result = await request(app).get("/api/auth/me");
  assert.equal(result.status, 429);
});
