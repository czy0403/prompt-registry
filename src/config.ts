import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ADMIN_API_TOKEN: z.string().min(32),
  ADMIN_ACTOR_ID: z.string().uuid(),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse(env);
}

export function loadDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return configSchema.shape.DATABASE_URL.parse(env.DATABASE_URL);
}
