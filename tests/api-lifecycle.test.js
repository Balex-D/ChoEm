import assert from "node:assert/strict";
import { test } from "node:test";
import { api, setApiAccount } from "../public/js/core/api.js";

test("a delayed mismatch from an old request does not suspend the new account", async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const events = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    value: events,
    configurable: true,
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete globalThis.window;
    setApiAccount(null);
  });
  let changed = 0,
    release;
  events.addEventListener("cho-em:account-changed", () => changed++);
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  t.mock.method(globalThis, "fetch", async () => {
    await pending;
    return Response.json(
      { error: { code: "ACCOUNT_CHANGED" } },
      { status: 409 },
    );
  });
  setApiAccount("a");
  const old = api("/state");
  setApiAccount("b");
  release();
  await assert.rejects(old, (error) => error.code === "ACCOUNT_CHANGED");
  assert.equal(changed, 0);
  await assert.rejects(
    api("/state"),
    (error) => error.code === "ACCOUNT_CHANGED",
  );
  assert.equal(changed, 1);
});
