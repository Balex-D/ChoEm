import { test } from "node:test";
import assert from "node:assert/strict";
import { sharedSummary } from "../src/modules/connections/service.js";
// @ts-ignore Browser view modules are tested without a browser bundle.
import { renderSharedSummary } from "../../dist/js/shared-view.js";
// @ts-ignore Dialog lifecycle is exercised with a controlled clock and DOM fixture.
import { invitationDialog } from "../../dist/js/invite-dialog.js";
const escape = (s: unknown) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

test("companion view displays only each category permitted by Em", () => {
  for (let mask = 0; mask < 8; mask++) {
    const privacy = {
      cycle: Boolean(mask & 1),
      mood: Boolean(mask & 2),
      notes: Boolean(mask & 4),
    };
    const summary = sharedSummary(
      {
        name: "Em",
        length: 28,
        duration: 5,
        starts: ["2026-10-01"],
        ends: {},
        entries: {
          "2026-10-03": {
            mood: "Vui vẻ",
            symptoms: ["Biểu hiện riêng"],
            note: "<script>private-note</script>",
          },
        },
        privacy,
      } as any,
      "2026-10-03",
    );
    const html = renderSharedSummary(summary, escape);
    assert.equal(html.includes("<h3>Chu kỳ</h3>"), privacy.cycle);
    assert.equal(html.includes("Vui vẻ"), privacy.mood);
    assert.equal(html.includes("private-note"), privacy.notes);
    assert.equal(html.includes("Biểu hiện riêng"), privacy.notes);
    assert.equal(html.includes("<script>"), false);
    assert.equal(html.includes(String(summary.care)), false);
  }
});

test("invitation hides UUID, counts down two minutes, and disables expired code", () => {
  const keys = ["document", "MutationObserver", "setInterval", "clearInterval"];
  const originals = keys.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const originalNow = Date.now;
  let now = 1000000,
    tick = () => {},
    cleared = false,
    html = "",
    qrRemoved = false;
  const code = { value: "K7M9X2" };
  const copyCode = { disabled: false },
    copyLink = { disabled: false };
  const timer = {
    textContent: "",
    isConnected: true,
    parentElement: { textContent: "" },
    closest: () => dialog,
  };
  const dialog = Object.assign(new EventTarget(), {
    open: true,
    querySelector: (s: string) =>
      s === ".invite-qr"
        ? {
            remove: () => {
              qrRemoved = true;
            },
          }
        : s === "#generated-invite"
          ? code
          : s === "#copy-code"
            ? copyCode
            : copyLink,
    querySelectorAll: () => [copyCode, copyLink],
  });
  try {
    Date.now = () => now;
    const values = {
      document: { querySelector: () => timer },
      MutationObserver: class {
        observe() {}
        disconnect() {}
      },
      setInterval: (fn: () => void) => {
        tick = fn;
        return 1;
      },
      clearInterval: () => {
        cleared = true;
      },
    };
    for (const [key, value] of Object.entries(values))
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value,
      });
    invitationDialog(
      {
        code: "K7M9X2",
        qr: "data:image/png;base64,test",
        ownerId: "PRIVATE-UUID",
        url: "https://example.com/#invite=K7M9X2&v=2",
        expiresAt: new Date(now + 120000).toISOString(),
      },
      {
        open: (value: string) => {
          html = value;
        },
        toast: () => {},
      },
    );
    assert.equal(timer.textContent, "02:00");
    assert.equal(html.includes("PRIVATE-UUID"), false);
    assert.equal(html.includes("UUID"), false);
    now += 1500;
    tick();
    assert.equal(timer.textContent, "01:59");
    now += 120000;
    tick();
    assert.equal(code.value, "");
    assert.equal(copyCode.disabled, true);
    assert.equal(copyLink.disabled, true);
    assert.equal(qrRemoved, true);
    assert.equal(cleared, true);
  } finally {
    dialog.dispatchEvent(new Event("close"));
    Date.now = originalNow;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
