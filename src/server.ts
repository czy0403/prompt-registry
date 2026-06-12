import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const app = buildApp(pool, { level: config.LOG_LEVEL });

const shutdown = async () => {
  await app.close();
  await pool.end();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host: config.HOST, port: config.PORT });
