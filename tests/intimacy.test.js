import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { temporaryDatabase } from "./helpers/database.js";
import { createApp } from "../server/build/app.js";
import { loadConfig } from "../server/build/config.js";
import { hashToken, randomToken } from "../server/build/common/security.js";
import {
  sharedDetails,
  sharedSummary,
} from "../server/build/modules/connections/service.js";
import { parseBackup } from "../shared/backup.js";
import { vietnamDay } from "../shared/dates.js";
import { stateSchema } from "../server/build/modules/sync/schema.js";
import { Cloud } from "../public/js/core/cloud.js";

const date = "2026-01-15";
const snapshot = () => ({
  name: "Em",
  starts: [],
  ends: {},
  entries: {},
  symptomSuggestions: [],
  periodEstimates: {},
  intimacyDates: [date],
  privacy: {
    cycle: false,
    notes: true,
    mood: false,
    symptoms: false,
    paused: false,
    intimacy: false,
    intimacyEdit: false,
  },
});

test("intimacy dates stay private independently of journal sharing and pause hides them", () => {
  const s = snapshot();
  assert.equal(sharedSummary(s, date).intimacy, undefined);
  assert.equal(sharedDetails(s, date, "2026-01").intimacy, undefined);
  s.privacy.intimacy = true;
  assert.deepEqual(sharedDetails(s, date, "2026-01", 5).intimacy, {
    dates: [date],
    canEdit: false,
    revision: 5,
  });
  assert.equal(sharedSummary(s, date).intimacy, true);
  s.privacy.paused = true;
  s.privacy.intimacyEdit = true;
  assert.equal(sharedDetails(s, date, "2026-01").intimacy, undefined);
});
test("backup preserves optional dates, validates them and supports older backups without dates", () => {
  assert.deepEqual(
    parseBackup(JSON.stringify({ state: snapshot() }), date).state
      .intimacyDates,
    [date],
  );
  const s = snapshot();
  delete s.intimacyDates;
  assert.equal(
    parseBackup(JSON.stringify({ state: s }), date).state.intimacyDates,
    undefined,
  );
  s.intimacyDates = ["2199-01-01"];
  assert.throws(() => parseBackup(JSON.stringify({ state: s }), date));
  assert.equal(stateSchema.safeParse(s).success, false);
});
test("owner calendar update preserves local edits that happen while the server responds", async (t) => {
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  t.after(() => delete navigator.onLine);
  let release, started;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const requested = new Promise((resolve) => {
    started = resolve;
  });
  const result = { state: snapshot(), revision: 2 };
  t.mock.method(globalThis, "fetch", async () => {
    started();
    await pending;
    return Response.json(result);
  });
  const cloud = new Cloud(
    {},
    {
      status() {},
      canRefresh: () => true,
      remote: () => assert.fail("Must preserve concurrent local edits"),
    },
  );
  cloud.user = { id: "a" };
  cloud.envelope = { state: snapshot(), revision: 1, dirty: false };
  cloud.sync = async () => {};
  const saving = cloud.changeIntimacy(date, true);
  await requested;
  cloud.sequence++;
  cloud.envelope.dirty = true;
  cloud.envelope.state.name = "Edited locally";
  release();
  await saving;
  assert.equal(cloud.envelope.state.name, "Edited locally");
  assert.equal(cloud.envelope.dirty, true);
  assert.equal(cloud.conflict.revision, 2);
});

test(
  "PostgreSQL intimacy permissions, peer editing, revision conflicts and revocation",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const sandbox = await temporaryDatabase(),
      db = sandbox.db;
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL,
    });
    const server = createApp(db, config).listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    config.APP_ORIGIN = origin;
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await sandbox.close();
    });
    async function account(role) {
      const id = randomUUID(),
        token = randomToken();
      await db.query(
        "INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,'unused',$3)",
        [id, `${id}@example.com`, role],
      );
      await db.query("INSERT INTO profiles(user_id,name) VALUES($1,'Em')", [
        id,
      ]);
      await db.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
        [hashToken(token), id],
      );
      return { id, token };
    }
    const em = await account("em"),
      anh = await account("anh"),
      outsider = await account("anh"),
      id = randomUUID();
    await db.query(
      "INSERT INTO connections(id,owner_id,companion_id) VALUES($1,$2,$3)",
      [id, em.id, anh.id],
    );
    async function call(user, path, method = "GET", body) {
      const res = await fetch(origin + "/api" + path, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "X-Cho-Em": "1",
          "X-Cho-Em-Account": user.id,
          Cookie: `ce_session=${user.token}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: res.status,
        body: res.status === 204 ? null : await res.json(),
      };
    }
    const today = vietnamDay(),
      month = today.slice(0, 7),
      patchPath = `/connections/${id}/intimacy/${today}`,
      sharedPath = `/connections/${id}/shared?month=${month}`;
    const current = async () => (await call(em, "/state")).body;
    async function permission(change) {
      const c = await current();
      const r = await call(em, "/state/privacy", "PATCH", {
        revision: c.revision,
        privacy: { ...c.state.privacy, ...change },
      });
      assert.equal(r.status, 200);
      return r.body;
    }
    let c = await current();
    const recorded = await call(em, `/state/intimacy/${today}`, "PATCH", {
      revision: c.revision,
      recorded: true,
    });
    assert.equal(recorded.status, 200);
    assert.deepEqual(recorded.body.state.intimacyDates, [today]);
    assert.equal((await call(anh, sharedPath)).body.shared.intimacy, undefined);
    assert.equal(
      (
        await call(anh, patchPath, "PATCH", {
          revision: recorded.body.revision,
          recorded: false,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call(outsider, patchPath, "PATCH", {
          revision: recorded.body.revision,
          recorded: false,
        })
      ).status,
      404,
    );
    // Old snapshots omit dates, and ordinary PUTs cannot grant view/edit permission.
    c = await current();
    delete c.state.intimacyDates;
    c.state.privacy.intimacy = true;
    c.state.privacy.intimacyEdit = true;
    assert.equal((await call(em, "/state", "PUT", c)).status, 200);
    c = await current();
    assert.deepEqual(c.state.intimacyDates, [today]);
    assert.equal(c.state.privacy.intimacy, false);
    await permission({ intimacy: true });
    let shared = (await call(anh, sharedPath)).body.shared;
    assert.deepEqual(shared.intimacy.dates, [today]);
    assert.equal(shared.intimacy.canEdit, false);
    assert.equal(
      (
        await call(anh, patchPath, "PATCH", {
          revision: shared.intimacy.revision,
          recorded: false,
        })
      ).status,
      403,
    );
    await permission({ intimacyEdit: true });
    shared = (await call(anh, sharedPath)).body.shared;
    assert.deepEqual(
      (await call(em, `/state/preview?month=${month}`)).body.shared,
      shared,
    );
    const stale = await current();
    assert.equal(
      (
        await call(anh, patchPath, "PATCH", {
          revision: shared.intimacy.revision,
          recorded: false,
        })
      ).status,
      200,
    );
    assert.deepEqual((await current()).state.intimacyDates, []);
    assert.equal((await call(em, "/state", "PUT", stale)).status, 409);
    const conflict = await call(anh, patchPath, "PATCH", {
      revision: shared.intimacy.revision,
      recorded: true,
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.details, undefined);
    await permission({ paused: true });
    assert.equal((await call(anh, sharedPath)).body.shared.intimacy, undefined);
    assert.equal(
      (
        await call(anh, patchPath, "PATCH", {
          revision: (await current()).revision,
          recorded: true,
        })
      ).status,
      403,
    );
    await permission({ paused: false, intimacy: false });
    assert.equal((await current()).state.privacy.intimacyEdit, false);
    await permission({ intimacy: true, intimacyEdit: true });
    assert.equal(
      (await call(em, `/connections/${id}`, "DELETE", {})).status,
      204,
    );
    assert.equal((await current()).state.privacy.intimacyEdit, false);
    assert.equal(
      (
        await call(anh, patchPath, "PATCH", {
          revision: (await current()).revision,
          recorded: true,
        })
      ).status,
      404,
    );
    c = await current();
    c.state.intimacyDates = ["2199-01-01"];
    assert.equal((await call(em, "/state", "PUT", c)).status, 400);
    assert.equal(
      (
        await call(em, "/state/intimacy/2199-01-01", "PATCH", {
          revision: c.revision,
          recorded: true,
        })
      ).status,
      400,
    );
  },
);
