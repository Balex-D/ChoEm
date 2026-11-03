import { test } from "node:test";
import assert from "node:assert/strict";
import { checkinEntry } from "../shared/checkin.js";
import { undoRecord, restoreUndo } from "../shared/undo.js";
import { parseBackup } from "../shared/backup.js";
import { stateSchema } from "../server/build/modules/sync/schema.js";
import {
  sharedSummary,
  sharedDetails,
} from "../server/build/modules/connections/service.js";

const date = "2026-01-15";
const state = () => ({
  name: "Em",
  starts: ["2026-01-01"],
  ends: { "2026-01-01": "2026-01-05" },
  periodEstimates: {},
  entries: {
    [date]: {
      mood: "Vui vẻ",
      symptoms: ["Đau đầu"],
      note: "private",
      shared: true,
      pain: 0,
      flow: "light",
      needs: ["rest"],
      needsShared: true,
    },
  },
  privacy: {
    cycle: true,
    mood: true,
    notes: true,
    symptoms: true,
    paused: false,
  },
  symptomSuggestions: [],
});

test("quick check-in distinguishes missing pain from zero, validates limits and keeps extra fields", () => {
  assert.equal(checkinEntry({ pain: "" }).pain, null);
  assert.equal(checkinEntry({ pain: "0" }).pain, 0);
  assert.deepEqual(
    checkinEntry({ needs: ["rest", "rest"], needsShared: true }).needs,
    ["rest"],
  );
  assert.equal(
    checkinEntry({ needs: [], needsShared: true }).needsShared,
    false,
  );
  for (const input of [
    { pain: 11 },
    { pain: -1 },
    { pain: 1.5 },
    { flow: "invalid" },
    { needs: ["invalid"] },
  ])
    assert.throws(() => checkinEntry(input));
  const s = state();
  s.entries[date].pain = 11;
  assert.equal(stateSchema.safeParse(s).success, false);
});
test("backup retains check-in data but disables journal and needs sharing", () => {
  const restored = parseBackup(JSON.stringify({ state: state() }), date).state;
  assert.equal(restored.entries[date].pain, 0);
  assert.equal(restored.entries[date].flow, "light");
  assert.deepEqual(restored.entries[date].needs, ["rest"]);
  assert.equal(restored.entries[date].needsShared, false);
  assert.equal(restored.entries[date].shared, false);
});
test("pause hides all personal data; pain and flow follow symptoms permission", () => {
  const s = state();
  s.privacy.paused = true;
  assert.deepEqual(sharedSummary(s, date), { name: "Em", paused: true });
  assert.deepEqual(sharedDetails(s, date, "2026-01"), {
    name: "Em",
    month: "2026-01",
    paused: true,
  });
  s.privacy.paused = false;
  s.privacy.symptoms = false;
  const summary = sharedSummary(s, date),
    details = sharedDetails(s, date, "2026-01");
  for (const key of ["symptoms", "pain", "flow"])
    assert.equal(Object.hasOwn(summary, key), false);
  assert.equal(Object.hasOwn(details, "body"), false);
  assert.deepEqual(summary.needs, ["rest"]);
});
test("needs require explicit sharing and expire from companion views after the day", () => {
  const s = state();
  assert.deepEqual(sharedDetails(s, date, "2026-01").needs, {
    [date]: ["rest"],
  });
  assert.equal(sharedSummary(s, "2026-01-16").needs, undefined);
  assert.equal(sharedDetails(s, "2026-01-16", "2026-01").needs, undefined);
  assert.equal(sharedDetails(s, date, "2025-12").needs, undefined);
  s.entries[date].needsShared = false;
  assert.equal(sharedSummary(s, date).needs, undefined);
});
test("journal undo restores privately without reverting newer privacy or unrelated entries", () => {
  const before = state(),
    after = structuredClone(before);
  delete after.entries[date];
  const record = undoRecord(before, after, { kind: "entry", date }, "a", 0);
  after.entries["2026-01-16"] = { note: "newer note" };
  after.privacy.paused = true;
  const result = restoreUndo(after, record, "a", 1);
  assert.equal(result.entries[date].note, "private");
  assert.equal(result.entries[date].shared, false);
  assert.equal(result.entries[date].needsShared, false);
  assert.equal(result.entries["2026-01-16"].note, "newer note");
  assert.equal(result.privacy.paused, true);
  assert.throws(() => restoreUndo(after, record, "b", 1));
  assert.throws(() => restoreUndo(after, record, "a", 60000));
  after.entries[date] = { note: "edited elsewhere" };
  assert.throws(() => restoreUndo(after, record, "a", 1), /ghi đè/);
});
test("period undo preserves journal edits and rejects subsequent period changes", () => {
  const before = state(),
    after = structuredClone(before);
  after.ends["2026-01-01"] = "2026-01-06";
  const record = undoRecord(before, after, { kind: "periods" }, "a", 0);
  after.entries[date].note = "later edit";
  assert.equal(
    restoreUndo(after, record, "a", 1).entries[date].note,
    "later edit",
  );
  assert.equal(
    restoreUndo(after, record, "a", 1).ends["2026-01-01"],
    "2026-01-05",
  );
  after.ends["2026-01-01"] = "2026-01-07";
  assert.throws(() => restoreUndo(after, record, "a", 1));
});
