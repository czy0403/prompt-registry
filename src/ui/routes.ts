import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";

const UI_ROOT = path.join(process.cwd(), "web");

const UI_SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
} as const;

const STATIC_ASSETS = {
  "app.css": { contentType: "text/css; charset=utf-8" },
  "app.js": { contentType: "text/javascript; charset=utf-8" },
} as const;

type StaticAssetName = keyof typeof STATIC_ASSETS;

function withUiSecurityHeaders(reply: FastifyReply): void {
  for (const [name, value] of Object.entries(UI_SECURITY_HEADERS)) {
    reply.header(name, value);
  }
}

async function sendUiFile(
  reply: FastifyReply,
  fileName: "index.html" | StaticAssetName,
  contentType: string,
) {
  withUiSecurityHeaders(reply);
  const body = await readFile(path.join(UI_ROOT, fileName), "utf8");
  return reply.type(contentType).send(body);
}

export function registerUiRoutes(app: FastifyInstance): void {
  app.get("/ui", async (_request, reply) =>
    sendUiFile(reply, "index.html", "text/html; charset=utf-8"),
  );

  app.get("/ui/", async (_request, reply) =>
    sendUiFile(reply, "index.html", "text/html; charset=utf-8"),
  );

  app.get<{ Params: { asset: string } }>("/ui/:asset", async (request, reply) => {
    const asset = request.params.asset;
    if (!(asset in STATIC_ASSETS)) {
      withUiSecurityHeaders(reply);
      return reply.code(404).send({
        error: {
          code: "not_found",
          message: "UI asset not found.",
        },
      });
    }

    const assetName = asset as StaticAssetName;
    return sendUiFile(reply, assetName, STATIC_ASSETS[assetName].contentType);
  });
}
