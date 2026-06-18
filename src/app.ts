import Fastify from "fastify";
import type pg from "pg";
import { ZodError } from "zod";
import { assertAdmin, type AdminAuthConfig } from "./auth.js";
import { AppError } from "./lib/errors.js";
import { registerProjectRoutes } from "./project/routes.js";
import { ProjectService } from "./project/service.js";
import { registerPromptRoutes } from "./prompt/routes.js";
import { PromptService } from "./prompt/service.js";
import { registerPublicRoutes } from "./public/routes.js";
import { registerUiRoutes } from "./ui/routes.js";

type PgError = Error & { code?: string; constraint?: string };

export function buildApp(
  pool: pg.Pool,
  auth: AdminAuthConfig,
  logger: boolean | object = true,
) {
  const app = Fastify({ logger });
  const promptService = new PromptService(pool);
  const projectService = new ProjectService(pool);

  app.get("/health", async () => ({ status: "ok" }));
  app.addHook("onRequest", async (request) => {
    if (request.url.startsWith("/api/v1/")) {
      assertAdmin(request, auth.adminApiToken);
    }
  });
  registerProjectRoutes(app, projectService);
  registerPromptRoutes(app, promptService, auth.adminActorId);
  registerPublicRoutes(app, pool);
  registerUiRoutes(app);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "validation_error",
          message: "Request validation failed.",
          details: error.issues,
        },
      });
    }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }

    const pgError = error as PgError;
    if (pgError.code === "23505") {
      return reply.code(409).send({
        error: {
          code: "conflict",
          message: "A resource with the same unique key already exists.",
          details: { constraint: pgError.constraint },
        },
      });
    }
    if (pgError.code === "23514") {
      return reply.code(400).send({
        error: {
          code: "constraint_violation",
          message: pgError.message,
          details: { constraint: pgError.constraint },
        },
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred.",
      },
    });
  });

  return app;
}
