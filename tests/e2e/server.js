import { temporaryDatabase } from "../helpers/database.js";
import { createApp } from "../../server/build/app.js";
import { loadConfig } from "../../server/build/config.js";
const sandbox = await temporaryDatabase();
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
