import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { temporaryDatabase } from "./helpers/database.js";
import { createApp } from "../server/build/app.js";
import { loadConfig } from "../server/build/config.js";
import { hashToken, randomToken } from "../server/build/common/security.js";
import { vietnamDay } from "../shared/dates.js";

test(
  "daily check-in, preview and pause API with PostgreSQL",
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
      connection = randomUUID();
    await db.query(
      "INSERT INTO connections(id,owner_id,companion_id) VALUES($1,$2,$3)",
      [connection, em.id, anh.id],
    );
    async function call(user, path, method = "GET", body) {
      const response = await fetch(origin + "/api" + path, {
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
      return { status: response.status, body: await response.json() };
    }
    const today = vietnamDay(),
      month = today.slice(0, 7);
    let current = (await call(em, "/state")).body;
    current.state.entries[today] = {
      mood: "Vui vẻ",
      symptoms: [],
      note: "journal",
      shared: true,
      pain: 0,
      flow: "medium",
      needs: ["listen"],
      needsText: "Tối nay Anh đi dạo cùng Em nhé",
      needsShared: true,
    };
    const saved = await call(em, "/state", "PUT", current);
    assert.equal(saved.status, 200);
    current = (await call(em, "/state")).body;
    assert.equal(current.state.entries[today].pain, 0);
    assert.equal(current.state.entries[today].flow, "medium");
    assert.deepEqual(current.state.entries[today].needs, ["listen"]);
    assert.equal(
      current.state.entries[today].needsText,
      "Tối nay Anh đi dạo cùng Em nhé",
    );
    const preview = await call(em, `/state/preview?month=${month}`);
    const actual = await call(
      anh,
      `/connections/${connection}/shared?month=${month}`,
    );
    assert.deepEqual(preview.body.shared, actual.body.shared);
    assert.equal(preview.body.shared.body, undefined);
    assert.deepEqual(preview.body.shared.needs, { [today]: ["listen"] });
    assert.equal(
      preview.body.shared.needsText[today],
      "Tối nay Anh đi dạo cùng Em nhé",
    );
    const paused = await call(em, "/state/privacy", "PATCH", {
      revision: current.revision,
      privacy: { ...current.state.privacy, paused: true },
    });
    assert.equal(paused.status, 200);
    const hidden = await call(
      anh,
      `/connections/${connection}/shared?month=${month}`,
    );
    assert.deepEqual(hidden.body.shared, { name: "Em", month, paused: true });
    current = (await call(em, "/state")).body;
    current.state.privacy.paused = false; // Ordinary/old client snapshots must not resume sharing.
    assert.equal((await call(em, "/state", "PUT", current)).body.paused, true);
    current = (await call(em, "/state")).body;
    assert.equal(current.state.privacy.paused, true);
    const conflict = await call(em, "/state/privacy", "PATCH", {
      revision: 0,
      privacy: { ...current.state.privacy, paused: false },
    });
    assert.equal(conflict.status, 409);
    const resumed = await call(em, "/state/privacy", "PATCH", {
      revision: current.revision,
      privacy: { ...current.state.privacy, paused: false, symptoms: true },
    });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.state.entries[today].shared, true);
    const shared = (
      await call(anh, `/connections/${connection}/shared?month=${month}`)
    ).body.shared;
    assert.deepEqual(shared.body[today], { pain: 0, flow: "medium" });
    current = (await call(em, "/state")).body;
    current.state.entries[today].pain = 11;
    assert.equal((await call(em, "/state", "PUT", current)).status, 400);
  },
);
