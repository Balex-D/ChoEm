import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore Pure rule-based module used by both server and UI.
import {
  analyzeCycles,
  recordLocalForecast,
  shiftDay,
} from "../../dist/js/cycle-analysis.js";
// @ts-ignore Pure display module.
import {
  renderCycleOverview,
  renderCycleCharts,
} from "../../dist/js/cycle-analysis-view.js";
const today = "2026-12-31";
function history(intervals: number[], durations: number[]) {
  const starts = ["2024-01-01"];
  for (const interval of intervals)
    starts.push(shiftDay(starts.at(-1), interval));
  return {
    starts,
    ends: Object.fromEntries(
      starts
        .slice(0, durations.length)
        .map((start, i) => [start, shiftDay(start, durations[i] - 1)]),
    ),
  };
}
test("defaults are 28 and 5 without fabricated observations", () => {
  const empty = analyzeCycles(
    { starts: [], ends: {}, length: 28, duration: 5 },
    today,
  );
  assert.equal(empty.averageCycleLength, 28);
  assert.equal(empty.averagePeriodLength, 5);
  assert.equal(empty.nextPeriodStart, null);
  const one = analyzeCycles(
    {
      starts: ["2024-01-01"],
      ends: { "2024-01-01": "2024-01-05" },
      length: 28,
      duration: 5,
    },
    today,
  );
  assert.equal(one.averagePeriodLength, 5);
  assert.equal(one.averageCycleLength, 28);
  assert.equal(one.nextPeriodStart, "2024-01-29");
  assert.ok(renderCycleOverview(empty).includes("--"));
  assert.ok(renderCycleCharts(empty).includes("Chưa đủ dữ liệu"));
});
test("averages round actual data from at most six latest intervals and completed periods", () => {
  const data = history(
    [10, 20, 30, 40, 50, 60, 70, 80],
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  const a = analyzeCycles(data, today);
  assert.equal(a.cycles.length, 6);
  assert.equal(a.completed.length, 6);
  assert.equal(a.averageCycleLength, 55);
  assert.equal(a.averagePeriodLength, 7);
  assert.equal(a.nextPeriodStart, shiftDay(data.starts.at(-1), 55));
  assert.equal(a.nextPeriodEnd, shiftDay(a.nextPeriodStart, 6));
});
test("ongoing periods are excluded from period-duration statistics", () => {
  const data = history([27, 29], [4, 6]);
  const a = analyzeCycles(data, today);
  assert.equal(a.completed.length, 2);
  assert.equal(a.averagePeriodLength, 5);
  assert.equal(a.averageCycleLength, 28);
  assert.equal(a.cycleNotice, null);
  assert.equal(a.periodNotice, null);
  assert.equal(
    analyzeCycles(history([28], []), today).nextPeriodStart,
    "2024-02-26",
  );
});
test("stability uses requested spread thresholds and requires three observations", () => {
  assert.match(
    analyzeCycles(history([28, 29, 30], [5, 5, 6]), today).cycleNotice,
    /khá đều đặn/,
  );
  assert.match(
    analyzeCycles(history([28, 32, 35], [5, 5, 6]), today).cycleNotice,
    /một chút thay đổi/,
  );
  assert.match(
    analyzeCycles(history([28, 32, 36], [5, 5, 7]), today).cycleNotice,
    /đáng chú ý/,
  );
  assert.match(
    analyzeCycles(history([28, 28], [5, 5, 6]), today).periodNotice,
    /khá ổn định/,
  );
  assert.match(
    analyzeCycles(history([28, 28], [5, 5, 7]), today).periodNotice,
    /một chút thay đổi/,
  );
  assert.equal(
    analyzeCycles(history([28, 35], [5, 7]), today).cycleNotice,
    null,
  );
});
test("early/near/late only compare with a forecast demonstrably saved before the actual start", () => {
  const data = { starts: ["2024-01-01", "2024-01-29", "2024-02-28"], ends: {} };
  assert.equal(analyzeCycles(data, today).timingNotice, null);
  const forecast = {
    anchor: "2024-01-29",
    start: "2024-02-26",
    end: "2024-03-01",
    issuedAt: "2024-01-30T00:00:00Z",
  };
  assert.match(
    analyzeCycles({ ...data, forecasts: [forecast] }, today).timingNotice,
    /muộn.*2 ngày/,
  );
  assert.match(
    analyzeCycles(
      { ...data, forecasts: [{ ...forecast, start: "2024-02-28" }] },
      today,
    ).timingNotice,
    /gần ngày/,
  );
  assert.match(
    analyzeCycles(
      { ...data, forecasts: [{ ...forecast, start: "2024-03-01" }] },
      today,
    ).timingNotice,
    /sớm.*2 ngày/,
  );
  assert.equal(
    analyzeCycles(
      {
        ...data,
        forecasts: [{ ...forecast, issuedAt: "2024-02-28T05:00:00Z" }],
      },
      today,
    ).timingNotice,
    null,
  );
});
test("guest forecast snapshots preserve original issue date when prediction does not change", () => {
  const data = history([28], [5, 5]);
  const first = recordLocalForecast(data, "2024-02-01", "2024-02-01T00:00:00Z");
  const next = recordLocalForecast(first, "2024-02-02", "2024-02-02T00:00:00Z");
  assert.equal(next.forecasts[0].issuedAt, first.forecasts[0].issuedAt);
  assert.equal(first.forecasts.length, 1);
});
