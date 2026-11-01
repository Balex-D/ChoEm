import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { temporaryDatabase } from "./helpers/database.js";
import { createApp } from "../server/build/app.js";
import { loadConfig } from "../server/build/config.js";
import {
  hashPassword,
  randomToken,
  hashToken,
} from "../server/build/common/security.js";
import {
  saveState,
  getState,
} from "../server/build/modules/sync/repository.js";
import { migrate } from "../server/build/db/migrate.js";

test(
  "PostgreSQL and API integration",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const sandbox = await temporaryDatabase();
    const db = sandbox.db;
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL,
    });
    const server = createApp(db, config).listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    config.APP_ORIGIN = origin;
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await sandbox.close();
    });
    const password = "test-password-123";
    const encoded = await hashPassword(password);
    async function user(role = "em") {
      const id = randomUUID(),
        token = randomToken(),
        email = `${id}@example.com`;
      await db.query(
        "INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,$3,$4)",
        [id, email, encoded, role],
      );
      await db.query("INSERT INTO profiles(user_id,name) VALUES($1,'Em')", [
        id,
      ]);
      await db.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
        [hashToken(token), id],
      );
      return { id, email, cookie: `ce_session=${token}` };
    }
    const state = () => ({
      name: "Em",
      starts: ["2026-01-01"],
      ends: { "2026-01-01": "2026-01-05" },
      periodEstimates: {},
      symptomSuggestions: [],
      entries: {
        "2026-01-01": {
          mood: "Vui vẻ",
          symptoms: ["Đau đầu"],
          note: "secret",
          shared: false,
        },
      },
      privacy: { cycle: false, mood: false, notes: false, symptoms: false },
    });
    async function call(
      account,
      path,
      method = "GET",
      body,
      accountId = account?.id,
    ) {
      const r = await fetch(origin + "/api" + path, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "X-Cho-Em": "1",
          ...(account ? { Cookie: account.cookie } : {}),
          ...(accountId ? { "X-Cho-Em-Account": accountId } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: r.status,
        body: r.status === 204 ? null : await r.json(),
      };
    }
    await t.test("migrations are repeatable", async () => {
      await migrate(db);
      const r = await db.query(
        "SELECT count(*)::int AS count FROM schema_migrations",
      );
      assert.equal(r.rows[0].count, 7);
    });
    await t.test(
      "stale tab cannot read or write another account with matching revision",
      async () => {
        const a = await user(),
          b = await user();
        for (const method of ["GET", "PUT"]) {
          const r = await call(
            b,
            "/state",
            method,
            method === "PUT" ? { revision: 0, state: state() } : undefined,
            a.id,
          );
          assert.equal(r.status, 409);
          assert.equal(r.body.error.code, "ACCOUNT_CHANGED");
        }
        assert.equal(
          (await call(b, "/state", "GET", undefined, null)).status,
          409,
        );
        assert.equal((await getState(db, b.id)).revision, 0);
      },
    );
    await t.test(
      "simultaneous writes produce one conflict and bulk writes remove stale records",
      async () => {
        const a = await user();
        const snapshot = state();
        const results = await Promise.allSettled([
          saveState(db, a.id, snapshot, 0),
          saveState(db, a.id, { ...snapshot, name: "Other" }, 0),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          results.find((r) => r.status === "rejected").reason.code,
          "SYNC_CONFLICT",
        );
        let queries = 0;
        const measured = {
          ...db,
          transaction: (run) =>
            db.transaction((q) =>
              run({
                query: (...args) => {
                  queries++;
                  return q.query(...args);
                },
              }),
            ),
        };
        const entries = Object.fromEntries(
          Array.from({ length: 500 }, (_, i) => [
            new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10),
            { mood: "", symptoms: [], note: `entry ${i}`, shared: false },
          ]),
        );
        await saveState(measured, a.id, { ...snapshot, entries }, 1);
        assert.ok(queries < 20, `Expected bounded query count, got ${queries}`);
        assert.equal(
          Object.keys((await getState(db, a.id)).state.entries).length,
          500,
        );
        await saveState(
          db,
          a.id,
          { ...snapshot, starts: [], ends: {}, entries: {} },
          2,
        );
        const final = await getState(db, a.id);
        assert.deepEqual(final.state.entries, {});
        assert.deepEqual(final.state.starts, []);
      },
    );
    await t.test(
      "invite can be accepted once; privacy revocation and disconnection take effect",
      async () => {
        const em = await user(),
          anh = await user("anh"),
          other = await user("anh");
        await saveState(db, em.id, state(), 0);
        const invite = await call(em, "/connections/invites", "POST", {});
        assert.equal(invite.status, 201);
        const accepts = await Promise.all([
          call(anh, "/connections/accept", "POST", { code: invite.body.code }),
          call(other, "/connections/accept", "POST", {
            code: invite.body.code,
          }),
        ]);
        assert.equal(accepts.filter((r) => r.status === 201).length, 1);
        const index = accepts.findIndex((r) => r.status === 201),
          companion = index === 0 ? anh : other,
          id = accepts[index].body.id;
        let r = await call(
          companion,
          `/connections/${id}/shared?month=2026-01`,
        );
        assert.deepEqual(r.body.shared, { name: "Em", month: "2026-01" });
        const shared = state();
        shared.privacy.cycle = true;
        shared.entries["2026-01-01"].shared = true;
        await saveState(db, em.id, shared, 1);
        r = await call(companion, `/connections/${id}/shared?month=2026-01`);
        assert.equal(r.body.shared.journal[0].note, "secret");
        assert.ok(r.body.shared.calendar);
        const privacy = await call(em, "/state/privacy", "PATCH", {
          revision: 2,
          privacy: state().privacy,
          hideExistingJournals: true,
        });
        assert.equal(privacy.status, 200);
        r = await call(companion, `/connections/${id}/shared?month=2026-01`);
        assert.equal(r.body.shared.journal, undefined);
        assert.equal(r.body.shared.calendar, undefined);
        assert.equal(
          (await call(em, `/connections/${id}`, "DELETE", {})).status,
          204,
        );
        assert.equal(
          (await call(companion, `/connections/${id}/shared?month=2026-01`))
            .status,
          404,
        );
      },
    );
    await t.test(
      "verification/reset tokens expire and are single-use; reset revokes sessions",
      async () => {
        const a = await user();
        const verification = randomToken();
        await db.query(
          "INSERT INTO account_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,'verify',now()+interval '1 hour')",
          [hashToken(verification), a.id],
        );
        assert.equal(
          (
            await call(null, "/auth/verify-email", "POST", {
              token: verification,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call(null, "/auth/verify-email", "POST", {
              token: verification,
            })
          ).status,
          400,
        );
        const token = randomToken();
        await db.query(
          "INSERT INTO account_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,'reset',now()-interval '1 second')",
          [hashToken(token), a.id],
        );
        assert.equal(
          (
            await call(null, "/auth/reset-password", "POST", {
              token,
              password,
            })
          ).status,
          400,
        );
        await db.query(
          "UPDATE account_tokens SET expires_at=now()+interval '1 hour' WHERE token_hash=$1",
          [hashToken(token)],
        );
        assert.equal(
          (
            await call(null, "/auth/reset-password", "POST", {
              token,
              password,
            })
          ).status,
          200,
        );
        assert.equal((await call(a, "/state")).status, 401);
        assert.equal(
          (
            await call(null, "/auth/reset-password", "POST", {
              token,
              password,
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "account deletion requires password and confirmation and cascades personal data",
      async () => {
        const a = await user();
        await saveState(db, a.id, state(), 0);
        assert.equal(
          (
            await call(a, "/auth/account", "DELETE", {
              password: "wrong",
              confirmation: "XÓA TÀI KHOẢN",
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await call(a, "/auth/account", "DELETE", {
              password,
              confirmation: "XÓA TÀI KHOẢN",
            })
          ).status,
          204,
        );
        for (const table of [
          "profiles",
          "cycles",
          "journal_entries",
          "sessions",
          "account_tokens",
        ])
          assert.equal(
            (
              await db.query(
                `SELECT count(*)::int AS count FROM ${table} WHERE user_id=$1`,
                [a.id],
              )
            ).rows[0].count,
            0,
          );
      },
    );
  },
);
