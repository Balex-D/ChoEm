import { temporaryDatabase } from "../helpers/database.js";
import { createApp } from "../../server/build/app.js";
import { loadConfig } from "../../server/build/config.js";
import { hashPassword } from "../../server/build/common/security.js";
import { randomUUID } from "node:crypto";
const sandbox = await temporaryDatabase();
const encoded = await hashPassword("daily-test-password");
for (const [prefix, role] of ["daily", "calendar", "sharing"].flatMap(
  (prefix) => ["em", "anh"].map((role) => [prefix, role]),
)) {
  const id = randomUUID();
  await sandbox.db.query(
    "INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,$3,$4)",
    [id, `${prefix}-${role}@example.test`, encoded, role],
  );
  await sandbox.db.query("INSERT INTO profiles(user_id,name) VALUES($1,$2)", [
    id,
    role === "em" ? "Em" : "Anh",
  ]);
}
const config = loadConfig({
  NODE_ENV: "test",
  PORT: "8099",
  APP_ORIGIN: "http://127.0.0.1:8099",
  DATABASE_URL: process.env.TEST_DATABASE_URL,
});
const server = createApp(sandbox.db, config).listen(config.PORT, "127.0.0.1");
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close(() => void sandbox.close().then(() => process.exit(0)));
  });
