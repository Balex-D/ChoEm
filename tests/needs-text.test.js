import assert from "node:assert/strict";
import { test } from "node:test";
import { checkinEntry } from "../shared/checkin.js";
import { parseBackup } from "../shared/backup.js";
import {
  sharedSummary,
  sharedDetails,
} from "../server/build/modules/connections/service.js";

const date = "2026-01-15";
test("needs form preserves journal and body; journal form preserves needs and consent", () => {
  const before = checkinEntry({
    note: "diary",
    mood: "Vui vẻ",
    pain: 4,
    flow: "light",
    shared: true,
  });
  const needs = checkinEntry(
    { needsText: "  Take a walk together  ", needsShared: true },
    before,
  );
  assert.equal(needs.note, "diary");
  assert.equal(needs.pain, 4);
  assert.equal(needs.flow, "light");
  assert.equal(needs.shared, true);
  assert.equal(needs.needsText, "Take a walk together");
  assert.equal(needs.needsShared, true);
  const edited = checkinEntry({ note: "updated diary", pain: "0" }, needs);
  assert.equal(edited.needsText, needs.needsText);
  assert.equal(edited.needsShared, true);
  assert.equal(edited.pain, 0);
  assert.equal(edited.note, "updated diary");
});
test("free text alone can be shared, blank content withdraws sharing and oversized text is rejected", () => {
  assert.equal(
    checkinEntry({ needsText: "Stay nearby", needsShared: true }).needsShared,
    true,
  );
  assert.equal(
    checkinEntry({ needs: [], needsText: " \n ", needsShared: true })
      .needsShared,
    false,
  );
  assert.throws(() => checkinEntry({ needsText: "x".repeat(501) }));
  assert.throws(() => checkinEntry({ needsText: 123 }));
});
test("custom needs text follows explicit consent, pause and today's date, independent of journal sharing", () => {
  const state = {
    name: "Em",
    starts: [],
    ends: {},
    periodEstimates: {},
    symptomSuggestions: [],
    entries: {
      [date]: checkinEntry({
        note: "private diary",
        needsText: "Stay with me",
        needsShared: true,
      }),
    },
    privacy: {
      cycle: false,
      mood: false,
      symptoms: false,
      notes: false,
      paused: false,
    },
  };
  assert.equal(sharedSummary(state, date).needsText, "Stay with me");
  assert.equal(sharedSummary(state, date).note, undefined);
  assert.deepEqual(sharedDetails(state, date, "2026-01").needsText, {
    [date]: "Stay with me",
  });
  assert.equal(
    sharedDetails(state, "2026-01-16", "2026-01").needsText,
    undefined,
  );
  state.privacy.paused = true;
  assert.equal(sharedSummary(state, date).needsText, undefined);
  state.privacy.paused = false;
  state.entries[date].needsShared = false;
  state.entries[date].shared = true;
  assert.equal(sharedSummary(state, date).needsText, undefined);
  const restored = parseBackup(JSON.stringify({ state }), date).state.entries[
    date
  ];
  assert.equal(restored.needsText, "Stay with me");
  assert.equal(restored.needsShared, false);
});
