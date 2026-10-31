import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore Pure PWA period model.
import {
  recordPeriodRange,
  recordPeriodDragRange,
  beginPeriod,
  finishPeriod,
  removePeriod,
  periodDayCount,
  ongoingPeriod,
} from "../../dist/js/period-records.js";
// @ts-ignore Calendar shares the exact model used by the UI.
import { cycleDayType, calendarMonth } from "../../dist/js/cycle-model.js";
import { stateSchema } from "../src/modules/sync/schema.js";
const today = "2025-11-15";
const empty = () => ({
  name: "Em",
  length: 28,
  duration: 5,
  starts: [],
  ends: {},
  entries: {
    "2025-10-01": { note: "keep me", mood: "", symptoms: [], shared: false },
  },
  privacy: { cycle: false, mood: false, notes: false, symptoms: false },
});

test("dragging back to the first day deletes only the edited period and preserves journals", () => {
  const prior = recordPeriodRange(empty(), "2025-09-01", "2025-09-05", today);
  for (const state of [
    recordPeriodRange(prior, "2025-10-01", "2025-10-09", today),
    beginPeriod(prior, "2025-10-01", today),
  ]) {
    const removed = recordPeriodDragRange(state, "2025-10-01", "2025-10-01", today, "2025-10-01");
    assert.deepEqual(removed, prior);
    assert.ok(state.starts.includes("2025-10-01"));
  }
  const single = recordPeriodDragRange(empty(), "2025-10-01", "2025-10-01", today);
  assert.equal(single.ends["2025-10-01"], "2025-10-01");
  const shortened = recordPeriodDragRange(
    recordPeriodRange(empty(), "2025-10-01", "2025-10-09", today),
    "2025-10-01", "2025-10-02", today, "2025-10-01",
  );
  assert.equal(shortened.ends["2025-10-01"], "2025-10-02");
});
test("drag range includes both endpoints across months and supports reverse drag", () => {
  const forward = recordPeriodRange(empty(), "2025-09-28", "2025-10-03", today);
  assert.deepEqual(forward.starts, ["2025-09-28"]);
  assert.equal(forward.ends["2025-09-28"], "2025-10-03");
  assert.equal(periodDayCount("2025-09-28", "2025-10-03"), 6);
  assert.deepEqual(
    recordPeriodRange(empty(), "2025-10-03", "2025-09-28", today),
    forward,
  );
  assert.equal(cycleDayType(forward, "2025-10-03", today), "period");
  assert.equal(cycleDayType(forward, "2025-10-04", today), "");
});
test("overlapping or adjacent ranges merge without duplicate starts or orphaned ends", () => {
  let state = recordPeriodRange(empty(), "2025-10-01", "2025-10-04", today);
  state = recordPeriodRange(state, "2025-10-03", "2025-10-07", today);
  state = recordPeriodRange(state, "2025-10-08", "2025-10-09", today);
  assert.deepEqual(state.starts, ["2025-10-01"]);
  assert.deepEqual(state.ends, { "2025-10-01": "2025-10-09" });
  assert.deepEqual(
    recordPeriodRange(state, "2025-10-01", "2025-10-09", today),
    state,
  );
  assert.equal(stateSchema.safeParse(state).success, true);
});
test("dragging an existing range back shrinks the end; deletion preserves journal", () => {
  const state = recordPeriodRange(empty(), "2025-10-01", "2025-10-09", today);
  const shortened = recordPeriodRange(
    state,
    "2025-10-01",
    "2025-10-04",
    today,
    "2025-10-01",
  );
  assert.equal(shortened.ends["2025-10-01"], "2025-10-04");
  assert.equal(state.ends["2025-10-01"], "2025-10-09");
  const removed = removePeriod(shortened, "2025-10-01");
  assert.deepEqual(removed.starts, []);
  assert.deepEqual(removed.ends, {});
  assert.equal(removed.entries["2025-10-01"].note, "keep me");
});
test("start persists an ongoing state past configured duration; finish uses inclusive actual dates", () => {
  const state = beginPeriod(empty(), "2025-11-01", today);
  const reloaded = JSON.parse(JSON.stringify(state));
  assert.equal(ongoingPeriod(reloaded, today)?.start, "2025-11-01");
  assert.equal(cycleDayType(reloaded, "2025-11-14", today), "period");
  const completed = finishPeriod(reloaded, "2025-11-01", today, today);
  assert.equal(ongoingPeriod(completed, today), null);
  assert.equal(periodDayCount("2025-11-01", completed.ends["2025-11-01"]), 15);
  assert.equal(stateSchema.safeParse(completed).success, true);
});
test("observed 28-day interval and completed five-day periods predict October 29 through November 2", () => {
  const prior = recordPeriodRange(empty(), "2025-09-03", "2025-09-07", today);
  const state = recordPeriodRange(prior, "2025-10-01", "2025-10-05", today);
  assert.equal(cycleDayType(state, "2025-10-29", today), "predicted");
  assert.equal(cycleDayType(state, "2025-11-02", today), "predicted");
  assert.equal(cycleDayType(state, "2025-11-03", today), "");
  assert.equal(calendarMonth(state, "2025-11", today)[0].type, "predicted");
});
test("future and invalid dates cannot be recorded; finishing cannot overlap another period", () => {
  assert.throws(() =>
    recordPeriodRange(empty(), "2025-11-14", "2025-11-16", today),
  );
  assert.throws(() => beginPeriod(empty(), "2025-02-30", today));
  const state = recordPeriodRange(empty(), "2025-10-01", "2025-10-05", today);
  assert.throws(() => beginPeriod(state, "2025-10-03", today));
  const later = beginPeriod(state, "2025-11-01", today);
  assert.throws(() => finishPeriod(later, "2025-10-01", "2025-11-02", today));
});
