import { randomUUID } from "node:crypto";
import { createDatabase } from "../../server/build/db/database.js";
import { migrate } from "../../server/build/db/migrate.js";

export async function temporaryDatabase() {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error("Set TEST_DATABASE_URL to a test PostgreSQL instance.");
  const admin = createDatabase(process.env.TEST_DATABASE_URL);
  const schema = "test_" + randomUUID().replaceAll("-", "");
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("options", `-csearch_path=${schema}`);
  const db = createDatabase(url.href);
  try {
    await migrate(db);
  } catch (error) {
    await db.close();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.close();
    throw error;
  }
  return {
    db,
    async close() {
      await db.close();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.close();
    },
  };
}
