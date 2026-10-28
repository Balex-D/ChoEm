import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { request } from "./request.js";
import type { Database, Queryable } from "../src/db/database.js";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { hashToken } from "../src/common/security.js";
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
    { ...sample(), duration: 15, length: 15 },
    { ...sample(), entries: { "2025-01-01": { note: "x".repeat(2001) } } },
  ])
    assert.equal(
      (await mutate(agent, "put", "/api/state", { revision: 0, state: bad }))
        .status,
      400,
    );
  assert.equal((await agent.get("/api/state")).body.revision, 0);
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
    revision: 2,
    privacy: { cycle: false, mood: false, notes: false },
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
