import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createDatabase, type Database } from "./database.js";
import { loadConfig } from "../config.js";
export async function migrate(db: Database) {
  const directory = resolve("server/src/db/migrations");
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  await db.transaction(async (q) => {
    await q.query("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
    for (const name of (await readdir(directory))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const sql = await readFile(resolve(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const { rows } = await q.query(
        "SELECT checksum FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (rows.length) {
        if (rows[0].checksum !== checksum)
          throw new Error(`Migration ${name} was modified after application`);
        continue;
      }
      await q.query(sql);
      await q.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
        [name, checksum],
      );
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const db = createDatabase(loadConfig().DATABASE_URL);
  try {
    await migrate(db);
    console.log("Database migrations complete");
  } finally {
    await db.close();
  }
}
