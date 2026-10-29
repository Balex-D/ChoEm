import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
// @ts-ignore Browser module is also a pure connection-payload parser.
import { parseConnectionCode } from "../../dist/js/connection-code.js";

const origin = "https://cho-em.example";
const token = "a".repeat(64);
const ownerId = randomUUID();
test("connection payload validates UUID, version and application origin", () => {
  assert.deepEqual(
    parseConnectionCode(`${origin}/#invite=K7M9X2&v=2`, origin),
    { code: "K7M9X2" },
  );
  assert.deepEqual(parseConnectionCode(" k7m9x2 ", origin), { code: "K7M9X2" });
  assert.deepEqual(
    parseConnectionCode(`${origin}/#invite=K7M9X2&em=${ownerId}&v=1`, origin),
    { code: "K7M9X2", ownerId },
  );
  assert.deepEqual(parseConnectionCode(`${origin}/#invite=k7m9x2`, origin), {
    code: "K7M9X2",
  });
  assert.deepEqual(
    parseConnectionCode(`${origin}/#invite=${token}&em=${ownerId}&v=1`, origin),
    { code: token, ownerId },
  );
  assert.deepEqual(parseConnectionCode(` ${token} `, origin), { token });
  assert.deepEqual(parseConnectionCode(`${origin}/#invite=${token}`, origin), {
    token,
  });
  for (const value of [
    `${origin}/#invite=${token}&em=${randomUUID()}&v=2`,
    `${origin}/#invite=${token}&em=invalid&v=1`,
    `${origin}/#invite=${token}&v=1`,
    `${origin}/#invite=${token}&em=${ownerId}`,
    `${origin}/#invite=${token}&invite=${token}`,
    `https://other.example/#invite=${token}&em=${ownerId}&v=1`,
    `javascript:alert(1)`,
    "",
    "x".repeat(600),
    "K7M9X",
    "K7M9X22",
    "K7M-X2",
    "K7 M92",
  ])
    assert.throws(() => parseConnectionCode(value, origin));
});
