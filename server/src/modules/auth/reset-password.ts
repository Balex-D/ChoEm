// Trusted server administrator recovery. Password input is hidden; never put passwords in CLI arguments.
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { loadConfig } from "../../config.js";
import { createDatabase } from "../../db/database.js";
import { hashPassword } from "../../common/security.js";
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !process.stdin.isTTY)
  throw new Error(
    "Run in an interactive terminal: npm run password:reset -- user@example.com",
  );
let hidden = false;
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!hidden) process.stdout.write(chunk);
    done();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });
async function ask(prompt: string) {
  process.stdout.write(prompt);
  hidden = true;
  const value = await new Promise<string>((resolve) =>
    rl.question("", resolve),
  );
  hidden = false;
  process.stdout.write("\n");
  return value;
}
try {
  const password = await ask("New password (6–128 characters): "),
    repeat = await ask("Repeat password: ");
  if (password.length < 6 || password.length > 128 || password !== repeat)
    throw new Error("Passwords must match and contain 6–128 characters");
  const db = createDatabase(loadConfig().DATABASE_URL);
  try {
    const encoded = await hashPassword(password);
    await db.transaction(async (q) => {
      const { rows } = await q.query(
        "UPDATE users SET password_hash=$1 WHERE email=$2 RETURNING id",
        [encoded, email],
      );
      if (!rows.length) throw new Error("Account not found");
      await q.query("DELETE FROM sessions WHERE user_id=$1", [rows[0].id]);
    });
    console.log("Password replaced; all sessions revoked.");
  } finally {
    await db.close();
  }
} finally {
  rl.close();
}
