import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgres://prompt_registry:prompt_registry@localhost:5432/prompt_registry"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse(env);
}
