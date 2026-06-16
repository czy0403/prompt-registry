import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const app = buildApp(
  pool,
  {
    adminApiToken: config.ADMIN_API_TOKEN,
    adminActorId: config.ADMIN_ACTOR_ID,
  },
  { level: config.LOG_LEVEL },
);

let shutdownPromise: Promise<void> | undefined;
const shutdown = () => {
  shutdownPromise ??= (async () => {
    await app.close();
    await pool.end();
  })();
  return shutdownPromise;
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

await app.listen({ host: config.HOST, port: config.PORT });
