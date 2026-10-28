import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db/database.js";
const config = loadConfig(),
  db = createDatabase(config.DATABASE_URL);
await db.query("SELECT 1 FROM schema_migrations LIMIT 1");
const server = createApp(db, config).listen(config.PORT, "0.0.0.0", () =>
  console.log(`Cho Em listening on port ${config.PORT}`),
);
const cleanup = setInterval(
  () =>
    db
      .query("DELETE FROM sessions WHERE expires_at<now()")
      .then(() => db.query("DELETE FROM rate_limits WHERE reset_at<now()"))
      .then(() =>
        db.query("DELETE FROM connection_invites WHERE expires_at<now()"),
      )
      .catch(() => console.error("Expired record cleanup failed")),
  3600000,
);
cleanup.unref();
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    clearInterval(cleanup);
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(() => {
      void db.close().then(() => process.exit(0));
    });
  });
