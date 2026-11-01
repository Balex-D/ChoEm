import assert from "node:assert/strict";
import { test } from "node:test";
import { Cloud } from "../public/js/core/cloud.js";
import {
  sharedSummary,
  sharedDetails,
} from "../server/build/modules/connections/service.js";
import { stateSchema } from "../server/build/modules/sync/schema.js";

const state = () => ({
  name: "Em",
  symptomSuggestions: [],
  starts: ["2026-01-01"],
  ends: {},
  periodEstimates: { "2026-01-01": 10 },
  entries: {},
  privacy: { cycle: true, mood: false, notes: false, symptoms: false },
});

test("shared cycle remains in period through an estimated end", () => {
  const snapshot = state();
  snapshot.ends["2026-01-01"] = "2026-01-10";
  for (const today of ["2026-01-08", "2026-01-10", "2026-01-11"]) {
    const expected = today <= "2026-01-10";
    assert.equal(sharedSummary(snapshot, today).cycle.inPeriod, expected);
    assert.equal(
      sharedDetails(snapshot, today, "2026-01").cycle.inPeriod,
      expected,
    );
  }
});

test("shared summary excludes private journal, moods, symptoms and cycle", () => {
  const snapshot = state();
  snapshot.privacy.cycle = false;
  snapshot.entries["2026-01-08"] = {
    note: "private",
    mood: "Vui vẻ",
    symptoms: ["Đau đầu"],
    shared: false,
  };
  const summary = sharedSummary(snapshot, "2026-01-08");
  for (const key of ["note", "mood", "symptoms", "cycle"])
    assert.equal(Object.hasOwn(summary, key), false);
  const details = sharedDetails(snapshot, "2026-01-08", "2026-01");
  for (const key of [
    "journal",
    "moods",
    "symptoms",
    "calendar",
    "analysis",
    "cycle",
  ])
    assert.equal(Object.hasOwn(details, key), false);
});

test("state validation rejects estimates overlapping the following period", () => {
  const snapshot = state();
  snapshot.starts.push("2026-01-05");
  assert.equal(stateSchema.safeParse(snapshot).success, false);
  snapshot.periodEstimates["2026-01-01"] = 4;
  assert.equal(stateSchema.safeParse(snapshot).success, true);
});

test("cloud refreshes derived state even when revision stays unchanged", async (t) => {
  const initial = { state: state(), revision: 3, dirty: false };
  const remote = structuredClone(initial);
  remote.state.ends["2026-01-01"] = "2026-01-10";
  let rendered, stored;
  t.mock.method(globalThis, "fetch", async () => Response.json(remote));
  const cloud = new Cloud(
    {
      set: async (_key, value) => {
        stored = structuredClone(value);
      },
    },
    {
      status() {},
      canRefresh: () => true,
      remote: (value) => {
        rendered = value;
      },
    },
  );
  cloud.user = { id: "user" };
  cloud.envelope = initial;
  await cloud.perform();
  assert.deepEqual(rendered, remote.state);
  assert.deepEqual(stored.state, remote.state);
});

test("cloud preserves local edits made while a refresh is in flight", async (t) => {
  let release, requested;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    requested = resolve;
  });
  const remote = { state: state(), revision: 4 };
  t.mock.method(globalThis, "fetch", async () => {
    requested();
    await pending;
    return Response.json(remote);
  });
  let rendered = false;
  const cloud = new Cloud(
    {},
    {
      status() {},
      canRefresh: () => true,
      remote: () => {
        rendered = true;
      },
    },
  );
  cloud.user = { id: "user" };
  cloud.envelope = { state: state(), revision: 3, dirty: false };
  const refreshing = cloud.perform();
  await started;
  cloud.envelope.state.name = "Local draft";
  cloud.envelope.dirty = true;
  cloud.sequence++;
  release();
  await refreshing;
  assert.equal(rendered, false);
  assert.equal(cloud.envelope.state.name, "Local draft");
  assert.equal(cloud.envelope.revision, 3);
  assert.equal(cloud.envelope.dirty, true);
});
