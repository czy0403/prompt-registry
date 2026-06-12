import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { unauthorized } from "../lib/errors.js";
import {
  createPromptSchema,
  createVersionSchema,
  diffQuerySchema,
  labelSchema,
  listPromptQuerySchema,
  moveLabelSchema,
  updatePromptSchema,
  uuidSchema,
} from "./schemas.js";
import type { PromptService } from "./service.js";

const promptIdParams = z.object({ promptId: uuidSchema });
const projectIdParams = z.object({ projectId: uuidSchema });
const versionParams = z.object({
  promptId: uuidSchema,
  version: z.coerce.number().int().positive(),
});
const labelParams = z.object({ promptId: uuidSchema, label: labelSchema });

function actorId(request: FastifyRequest): string {
  const value = request.headers["x-user-id"];
  const parsed = uuidSchema.safeParse(Array.isArray(value) ? value[0] : value);
  if (!parsed.success) {
    throw unauthorized();
  }
  return parsed.data;
}

export function registerPromptRoutes(
  app: FastifyInstance,
  service: PromptService,
): void {
  app.post("/api/v1/projects/:projectId/prompts", async (request, reply) => {
    const { projectId } = projectIdParams.parse(request.params);
    const body = createPromptSchema.parse(request.body);
    const prompt = await service.createPrompt(
      { ...body, project_id: projectId },
      actorId(request),
    );
    return reply.code(201).send(prompt);
  });

  app.get("/api/v1/projects/:projectId/prompts", async (request) => {
    const { projectId } = projectIdParams.parse(request.params);
    const query = listPromptQuerySchema.parse(request.query);
    return service.listPrompts(projectId, query.include_archived);
  });

  app.get("/api/v1/prompts/:promptId", async (request) => {
    const { promptId } = promptIdParams.parse(request.params);
    return service.getPrompt(promptId);
  });

  app.patch("/api/v1/prompts/:promptId", async (request) => {
    const { promptId } = promptIdParams.parse(request.params);
    actorId(request);
    return service.updatePrompt(promptId, updatePromptSchema.parse(request.body));
  });

  app.delete("/api/v1/prompts/:promptId", async (request, reply) => {
    const { promptId } = promptIdParams.parse(request.params);
    actorId(request);
    await service.archivePrompt(promptId);
    return reply.code(204).send();
  });

  app.post("/api/v1/prompts/:promptId/versions", async (request, reply) => {
    const { promptId } = promptIdParams.parse(request.params);
    const version = await service.createVersion(
      promptId,
      createVersionSchema.parse(request.body),
      actorId(request),
    );
    return reply.code(201).send(version);
  });

  app.get("/api/v1/prompts/:promptId/versions", async (request) => {
    const { promptId } = promptIdParams.parse(request.params);
    return service.listVersions(promptId);
  });

  app.get("/api/v1/prompts/:promptId/versions/:version", async (request) => {
    const { promptId, version } = versionParams.parse(request.params);
    return service.getVersion(promptId, version);
  });

  app.get(
    "/api/v1/prompts/:promptId/versions/:version/diff",
    async (request) => {
      const { promptId, version } = versionParams.parse(request.params);
      const { base_version } = diffQuerySchema.parse(request.query);
      return service.diffVersions(promptId, base_version, version);
    },
  );

  app.get("/api/v1/prompts/:promptId/labels", async (request) => {
    const { promptId } = promptIdParams.parse(request.params);
    return service.listLabels(promptId);
  });

  app.put("/api/v1/prompts/:promptId/labels/:label", async (request) => {
    const { promptId, label } = labelParams.parse(request.params);
    const body = moveLabelSchema.parse(request.body);
    return service.moveLabel({
      prompt_id: promptId,
      label,
      ...body,
      actor_id: actorId(request),
      action: "publish",
    });
  });

  app.post(
    "/api/v1/prompts/:promptId/labels/:label/rollback",
    async (request) => {
      const { promptId, label } = labelParams.parse(request.params);
      const body = moveLabelSchema.parse(request.body);
      return service.moveLabel({
        prompt_id: promptId,
        label,
        ...body,
        actor_id: actorId(request),
        action: "rollback",
      });
    },
  );

  app.get(
    "/api/v1/prompts/:promptId/labels/:label/history",
    async (request) => {
      const { promptId, label } = labelParams.parse(request.params);
      return service.listLabelHistory(promptId, label);
    },
  );
}
