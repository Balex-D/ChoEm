import { test } from "node:test";
import assert from "node:assert/strict";
import { Cloud } from "../public/js/core/cloud.js";

const state = () => ({
  name: "Em",
  entries: {},
  starts: [],
  ends: {},
  privacy: { cycle: false, mood: false, symptoms: false, notes: true },
});
test("privacy changes update state without page renders and preserve other-device changes", async (t) => {
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  t.after(() => delete navigator.onLine);
  const initial = state(),
    remote = state();
  remote.privacy.mood = true;
  let body,
    local = initial;
  const refreshes = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (options.method === "PATCH") {
      body = JSON.parse(options.body);
      return Response.json({
        state: { ...remote, privacy: body.privacy },
        revision: 3,
      });
    }
    return Response.json({ state: remote, revision: 2 });
  });
  const cloud = new Cloud(
    { set: async () => {} },
    {
      status() {},
      canRefresh: () => true,
      remote(next, options) {
        local = next;
        refreshes.push(options.refresh);
      },
    },
  );
  cloud.user = { id: "a" };
  cloud.envelope = { state: initial, revision: 1, dirty: false };
  await cloud.changePrivacy(
    { ...initial.privacy, cycle: true },
    { refreshView: false },
  );
  assert.deepEqual(refreshes, [false, false]);
  assert.equal(local.privacy.cycle, true);
  assert.equal(local.privacy.mood, true);
  assert.equal(body.privacy.mood, true);
  assert.equal(body.revision, 2);
  assert.equal(body.hideExistingJournals, false);
  assert.equal(cloud.privacyBusy, false);
  assert.equal(cloud.quietRefresh, false);
});
test("failed privacy requests release quiet-refresh state and do not apply flags", async (t) => {
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  t.after(() => delete navigator.onLine);
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: { message: "failed" } }, { status: 503 }),
  );
  const cloud = new Cloud(
    {},
    {
      status() {},
      remote: () => assert.fail("Should not apply rejected permissions"),
    },
  );
  cloud.user = { id: "a" };
  cloud.envelope = { state: state(), revision: 1, dirty: false };
  cloud.sync = async () => {};
  await assert.rejects(
    cloud.changePrivacy(
      { ...state().privacy, notes: false },
      { refreshView: false },
    ),
  );
  assert.equal(cloud.envelope.state.privacy.notes, true);
  assert.equal(cloud.quietRefresh, false);
  assert.equal(cloud.privacyBusy, false);
});
