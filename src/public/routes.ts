import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { authenticateProjectToken } from "../auth.js";
import { badRequest, notFound } from "../lib/errors.js";
import { labelSchema, promptKeySchema } from "../prompt/schemas.js";
import { extractVariables } from "../prompt/variables.js";

const promptParams = z.object({ promptKey: promptKeySchema });
const promptQuery = z
  .object({ label: labelSchema.default("production") })
  .strict();

export function registerPublicRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get("/api/public/v1/prompts/:promptKey", async (request) => {
    const projectId = await authenticateProjectToken(pool, request);
    const { promptKey } = promptParams.parse(request.params);
    const { label } = promptQuery.parse(request.query);
    if (label === "latest") {
      throw badRequest("The latest label is not available through the public API.");
    }

    const result = await pool.query(
      `SELECT
         p.prompt_key,
         p.name,
         p.description,
         p.type,
         pv.version,
         pl.label,
         pv.content,
         pv.model_config
       FROM prompt p
       JOIN project project ON project.id = p.project_id
       JOIN prompt_label pl ON pl.prompt_id = p.id AND pl.label = $3
       JOIN prompt_version pv ON pv.id = pl.version_id
       WHERE p.project_id = $1
         AND p.prompt_key = $2
         AND p.archived_at IS NULL
         AND project.archived_at IS NULL`,
      [projectId, promptKey, label],
    );
    if (!result.rows[0]) {
      throw notFound("Published prompt not found.");
    }
    const prompt = result.rows[0] as {
      type: "text" | "chat";
      content: unknown;
    };
    return {
      ...result.rows[0],
      variables: extractVariables(prompt.type, prompt.content),
    };
  });
}
