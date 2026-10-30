import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/db/migrate.js";
import { readState } from "../src/modules/sync/repository.js";
import type { Database, Queryable } from "../src/db/database.js";
test("automatic-analysis migration removes manual settings without deleting actual history", async () => {
  const engine = new PGlite();
  await engine.waitReady;
  const query =
    (client: any): Queryable["query"] =>
    async (sql, values) => {
      if (!values && sql.includes(";")) {
        await client.exec(sql);
        return { rows: [] };
      }
      return client.query(sql, values);
    };
  const db: Database = {
    query: query(engine),
    transaction: (fn) => engine.transaction((tx) => fn({ query: query(tx) })),
    close: () => engine.close(),
  };
  try {
    await engine.exec(
      "CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of [
      "001_initial.sql",
      "002_roles_symptoms.sql",
      "003_journal_visibility.sql",
    ]) {
      const sql = await readFile("server/src/db/migrations/" + name, "utf8");
      await engine.exec(sql);
      await db.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
        [name, createHash("sha256").update(sql).digest("hex")],
      );
    }
    const id = randomUUID();
    await db.query(
      "INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test')",
      [id, "migration@example.test"],
    );
    await db.query(
      "INSERT INTO profiles(user_id,name,cycle_length,period_duration,share_cycle) VALUES($1,'Em',31,7,true)",
      [id],
    );
    await db.query(
      "INSERT INTO cycles(user_id,start_date,end_date) VALUES($1,'2025-01-01','2025-01-05')",
      [id],
    );
    await db.query(
      "INSERT INTO journal_entries(user_id,entry_date,note,shared) VALUES($1,'2025-01-02','preserved',true)",
      [id],
    );
    await migrate(db);
    await migrate(db);
    const saved = (await readState(db, id)).state;
    assert.deepEqual(saved.starts, ["2025-01-01"]);
    assert.equal(saved.ends["2025-01-01"], "2025-01-05");
    assert.equal(saved.entries["2025-01-02"].note, "preserved");
    assert.equal(saved.entries["2025-01-02"].shared, true);
    assert.equal(saved.privacy.cycle, true);
    assert.equal("length" in saved, false);
    assert.equal("duration" in saved, false);
    assert.deepEqual(saved.forecasts, []);
    const columns = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('cycle_length','period_duration')",
    );
    assert.equal(columns.rows.length, 0);
  } finally {
    await db.close();
  }
});
