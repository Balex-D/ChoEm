import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
// @ts-ignore Pure PWA period model.
import {
  recordPeriodRange,
  recordPeriodDragRange,
  beginPeriod,
  finishPeriod,
  removePeriod,
  periodDayCount,
  ongoingPeriod,
  periodContaining,
  resolvePeriods,
} from "../../dist/js/period-records.js";
// @ts-ignore Calendar shares the exact model used by the UI.
import { cycleDayType, calendarMonth } from "../../dist/js/cycle-model.js";
import { stateSchema } from "../src/modules/sync/schema.js";
const today = "2025-11-15";
test("calendar button respects selected end and today button still ends today", () => {
  const source = readFileSync("dist/app.js", "utf8");
  const handler = source.slice(
    source.indexOf("function handlePeriodAction(day)"),
    source.indexOf("function renderPeriodControls()"),
  );
  for (const currentDay of ["2025-11-03", "2025-11-07"]) {
    for (const selectedDay of ["2025-11-02", currentDay]) {
      let saved: any;
      let selectedAfter: string | undefined;
      const context = {
        state: beginPeriod(empty(), "2025-11-01", "2025-11-01"),
        todayKey: currentDay,
        periodContaining, ongoingPeriod, finishPeriod, beginPeriod,
        editPeriodDialog: () => assert.fail("Expected ongoing period action"),
        savePeriodChange: (change: (state: any) => any, selected: string) => {
          saved = change(context.state);
          selectedAfter = selected;
        },
      };
      runInNewContext(handler + `\nhandlePeriodAction("${selectedDay}");`, context);
      assert.equal(saved.ends["2025-11-01"], selectedDay);
      assert.equal(selectedAfter, selectedDay);
      const reloaded = resolvePeriods(JSON.parse(JSON.stringify(saved)), "2025-11-10");
      assert.equal(reloaded.ends["2025-11-01"], selectedDay);
      assert.equal(reloaded.periodEstimates["2025-11-01"], undefined);
      assert.equal(stateSchema.safeParse(reloaded).success, true);
    }
  }
});
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
    const removed = recordPeriodDragRange(
      state,
      "2025-10-01",
      "2025-10-01",
      today,
      "2025-10-01",
    );
    assert.deepEqual(
      { ...removed, periodEstimates: {} },
      { ...prior, periodEstimates: {} },
    );
    assert.ok(state.starts.includes("2025-10-01"));
  }
  const single = recordPeriodDragRange(
    empty(),
    "2025-10-01",
    "2025-10-01",
    today,
  );
  assert.equal(single.ends["2025-10-01"], "2025-10-01");
  const shortened = recordPeriodDragRange(
    recordPeriodRange(empty(), "2025-10-01", "2025-10-09", today),
    "2025-10-01",
    "2025-10-02",
    today,
    "2025-10-01",
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
test("historical button recording uses estimated duration; confirmation uses actual dates", () => {
  const state = beginPeriod(empty(), "2025-11-01", today);
  const reloaded = JSON.parse(JSON.stringify(state));
  assert.equal(ongoingPeriod(reloaded, today), null);
  assert.equal(reloaded.ends["2025-11-01"], "2025-11-05");
  assert.equal(cycleDayType(reloaded, "2025-11-14", today), "");
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

test("button recording separates future estimates, extends through day seven and auto-closes on day eight", () => {
  const state = beginPeriod(empty(), "2025-11-01", "2025-11-03");
  assert.equal(cycleDayType(state, "2025-11-03", "2025-11-03"), "period");
  assert.equal(cycleDayType(state, "2025-11-04", "2025-11-03"), "predicted");
  assert.equal(cycleDayType(state, "2025-11-06", "2025-11-06"), "period");
  assert.equal(ongoingPeriod(state, "2025-11-07")?.start, "2025-11-01");
  const closed = resolvePeriods(
    JSON.parse(JSON.stringify(state)),
    "2025-11-08",
  );
  assert.equal(closed.ends["2025-11-01"], "2025-11-05");
  assert.equal(ongoingPeriod(closed, "2025-11-08"), null);
  assert.equal(cycleDayType(closed, "2025-11-06", "2025-11-08"), "");
  assert.equal(stateSchema.safeParse(closed).success, true);
});

test("personal average is frozen at recording and inferred ends never enter actual statistics", async () => {
  const { analyzeCycles } = await import("../../dist/js/cycle-analysis.js");
  const history = recordPeriodRange(empty(), "2025-10-01", "2025-10-06", today);
  const state = beginPeriod(history, "2025-11-01", "2025-11-03");
  assert.equal(state.periodEstimates["2025-11-01"], 6);
  const closed = resolvePeriods(state, "2025-11-08");
  assert.equal(closed.ends["2025-11-01"], "2025-11-06");
  assert.equal(analyzeCycles(closed, today).completed.length, 1);
  const confirmed = finishPeriod(closed, "2025-11-01", "2025-11-07", today);
  assert.equal(analyzeCycles(confirmed, today).completed.length, 2);
  assert.equal(confirmed.periodEstimates["2025-11-01"], undefined);
});

test("expected end today remains open and can be confirmed", () => {
  const state = beginPeriod(empty(), "2025-11-01", "2025-11-05");
  assert.equal(ongoingPeriod(state, "2025-11-05")?.start, "2025-11-01");
  const confirmed = finishPeriod(
    state,
    "2025-11-01",
    "2025-11-05",
    "2025-11-05",
  );
  assert.equal(ongoingPeriod(confirmed, "2025-11-05"), null);
});
