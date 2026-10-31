import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore Shared browser/server date model.
import { cycleDayType, calendarMonth } from "../../dist/js/cycle-model.js";
import { sharedDetails } from "../src/modules/connections/service.js";
// @ts-ignore Pure companion view.
import { renderSharedDetails } from "../../dist/js/shared-details.js";
test("actual period end overrides configured duration and deleting an entry removes its days", () => {
  const state = {
    starts: ["2026-10-01"],
    ends: { "2026-10-01": "2026-10-10" },
    length: 28,
    duration: 5,
  };
  assert.equal(cycleDayType(state, "2026-10-09", "2026-10-20"), "period");
  assert.equal(cycleDayType(state, "2026-10-11", "2026-10-20"), "");
  assert.equal(
    cycleDayType({ ...state, ends: {} }, "2026-10-09", "2026-10-09"),
    "period",
  );
  assert.equal(cycleDayType(state, "2026-10-15", "2026-10-20"), "ovulation");
  assert.equal(cycleDayType(state, "2026-10-29", "2026-10-20"), "predicted");
  assert.equal(
    calendarMonth(
      { ...state, starts: [], ends: {} },
      "2026-10",
      "2026-10-20",
    ).every((day: any) => day.type === ""),
    true,
  );
});
test("all sixteen permission combinations filter monthly data and never expose hidden journal text", () => {
  for (let mask = 0; mask < 16; mask++) {
    const privacy = {
      cycle: Boolean(mask & 1),
      mood: Boolean(mask & 2),
      symptoms: Boolean(mask & 4),
      notes: Boolean(mask & 8),
    };
    const data = sharedDetails(
      {
        name: "Em",
        starts: ["2026-10-01"],
        ends: { "2026-10-01": "2026-10-04" },
        length: 28,
        duration: 5,
        privacy,
        entries: {
          "2026-10-03": {
            mood: "Vui vẻ",
            symptoms: ["Đau đầu"],
            note: "<secret-public>",
            shared: privacy.notes,
          },
          "2026-10-04": {
            mood: "",
            symptoms: [],
            note: "PRIVATE-TEXT",
            shared: false,
          },
        },
      } as any,
      "2026-10-20",
      "2026-10",
    );
    assert.equal("calendar" in data, privacy.cycle);
    assert.equal("moods" in data, privacy.mood);
    assert.equal("symptoms" in data, privacy.symptoms);
    assert.equal("journal" in data, privacy.notes);
    assert.equal(JSON.stringify(data).includes("PRIVATE-TEXT"), false);
    const html = renderSharedDetails(data, "2026-10-03", (value: unknown) =>
      String(value).replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    );
    assert.equal(html.includes("<secret-public>"), false);
    assert.equal(html.includes("secret-public"), privacy.notes);
  }
});
