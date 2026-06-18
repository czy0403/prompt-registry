import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { uuidSchema } from "../prompt/schemas.js";
import {
  createApiTokenSchema,
  createProjectSchema,
  listApiTokenQuerySchema,
  updateProjectSchema,
} from "./schemas.js";
import type { ProjectService } from "./service.js";

const projectIdParams = z.object({ projectId: uuidSchema });
const tokenIdParams = z.object({ projectId: uuidSchema, tokenId: uuidSchema });

export function registerProjectRoutes(
  app: FastifyInstance,
  service: ProjectService,
): void {
  app.post("/api/v1/projects", async (request, reply) => {
    const project = await service.createProject(createProjectSchema.parse(request.body));
    return reply.code(201).send(project);
  });

  app.get("/api/v1/projects", async () => service.listProjects());

  app.get("/api/v1/projects/:projectId", async (request) => {
    const { projectId } = projectIdParams.parse(request.params);
    return service.getProject(projectId);
  });

  app.patch("/api/v1/projects/:projectId", async (request) => {
    const { projectId } = projectIdParams.parse(request.params);
    return service.updateProject(projectId, updateProjectSchema.parse(request.body));
  });

  app.delete("/api/v1/projects/:projectId", async (request, reply) => {
    const { projectId } = projectIdParams.parse(request.params);
    await service.archiveProject(projectId);
    return reply.code(204).send();
  });

  app.delete("/api/v1/projects/:projectId/permanent", async (request) => {
    const { projectId } = projectIdParams.parse(request.params);
    return service.permanentlyDeleteArchivedProject(projectId);
  });

  app.post("/api/v1/projects/:projectId/api-tokens", async (request, reply) => {
    const { projectId } = projectIdParams.parse(request.params);
    const { name } = createApiTokenSchema.parse(request.body);
    return reply.code(201).send(await service.createApiToken(projectId, name));
  });

  app.get("/api/v1/projects/:projectId/api-tokens", async (request) => {
    const { projectId } = projectIdParams.parse(request.params);
    const { include_revoked } = listApiTokenQuerySchema.parse(request.query);
    return service.listApiTokens(projectId, include_revoked);
  });

  app.delete(
    "/api/v1/projects/:projectId/api-tokens/:tokenId",
    async (request, reply) => {
      const { projectId, tokenId } = tokenIdParams.parse(request.params);
      await service.revokeApiToken(projectId, tokenId);
      return reply.code(204).send();
    },
  );
}
