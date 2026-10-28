import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Cloud } from "../../dist/js/cloud.js";
const originalFetch = globalThis.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalNavigator)
    Object.defineProperty(globalThis, "navigator", originalNavigator);
});
function setup() {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: true },
  });
  const saved = new Map<string, unknown>();
  const cloud = new Cloud(
    {
      get: async (k: string) => saved.get(k),
      set: async (k: string, v: unknown) => {
        saved.set(k, structuredClone(v));
      },
    },
    { status: () => {}, remote: () => {}, canRefresh: () => false },
  );
  cloud.user = { id: "account-a", email: "a@example.com" };
  cloud.envelope = { state: { name: "first" }, revision: 3, dirty: true };
  return { cloud, saved };
}
test("a local edit during upload is sent again using the acknowledged revision", async () => {
  const { cloud } = setup(),
    writes: any[] = [];
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options!.body as string);
    writes.push(body);
    if (writes.length === 1) await pending;
    return new Response(JSON.stringify({ revision: body.revision + 1 }), {
      status: 200,
    });
  };
  const syncing = cloud.sync();
  await new Promise((resolve) => setImmediate(resolve));
  await cloud.save({ name: "edited while uploading" });
  release();
  await syncing;
  clearTimeout(cloud.debounce);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].revision, 3);
  assert.equal(writes[1].revision, 4);
  assert.equal(writes[1].state.name, "edited while uploading");
  assert.equal(cloud.envelope.dirty, false);
  assert.equal(cloud.envelope.revision, 5);
});
test("conflict keeps the offline copy and stops automatic retries", async () => {
  const { cloud, saved } = setup();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(
      JSON.stringify({
        error: {
          code: "SYNC_CONFLICT",
          message: "Conflict",
          details: { revision: 8, state: { name: "other-device" } },
        },
      }),
      { status: 409 },
    );
  };
  await cloud.save({ name: "local-draft" });
  await cloud.sync();
  clearTimeout(cloud.debounce);
  await cloud.sync();
  assert.equal(calls, 1);
  assert.equal(cloud.envelope.state.name, "local-draft");
  assert.equal(cloud.envelope.dirty, true);
  assert.equal(cloud.conflict.revision, 8);
  assert.ok(saved.has("account:account-a"));
});
test("network failure retains the queue instead of reporting successful sync", async () => {
  const { cloud, saved } = setup();
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  await cloud.save({ name: "offline-data" });
  await cloud.sync();
  clearTimeout(cloud.debounce);
  assert.equal(cloud.envelope.dirty, true);
  assert.match(cloud.status, /Ngoại tuyến/);
  assert.ok(saved.has("account:account-a"));
});
