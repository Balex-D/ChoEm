import { z } from "zod";
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  APP_ORIGIN: z.string().url().default("http://localhost:8080"),
  DATABASE_URL: z.string().min(1),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});
export type Config = z.infer<typeof schema>;
export function loadConfig(env = process.env): Config {
  const c = schema.parse(env);
  const url = new URL(c.APP_ORIGIN);
  if (url.origin !== c.APP_ORIGIN || url.username || url.password)
    throw new Error(
      "APP_ORIGIN must be an origin without a path or trailing slash",
    );
  if (c.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("Production requires HTTPS APP_ORIGIN");
  return c;
}
