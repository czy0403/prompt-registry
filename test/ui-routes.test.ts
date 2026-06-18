import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { buildApp } from "../src/app.js";

const adminToken = "test-admin-token-that-is-at-least-32-chars";

describe("UI routes", () => {
  let app: FastifyInstance;

  before(async () => {
    app = buildApp(
      {} as pg.Pool,
      { adminApiToken: adminToken, adminActorId: randomUUID() },
      false,
    );
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it("serves the web admin shell without administrator auth", async () => {
    const response = await app.inject({ method: "GET", url: "/ui/" });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] as string, /text\/html/);
    assert.match(response.body, /Prompt Registry/);
    assert.match(
      response.headers["content-security-policy"] as string,
      /script-src 'self'/,
    );
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["referrer-policy"], "no-referrer");
    assert.equal(response.headers["cache-control"], "no-store");
  });

  it("serves fixed CSS and JavaScript assets", async () => {
    const css = await app.inject({ method: "GET", url: "/ui/app.css" });
    const js = await app.inject({ method: "GET", url: "/ui/app.js" });

    assert.equal(css.statusCode, 200);
    assert.match(css.headers["content-type"] as string, /text\/css/);
    assert.match(css.body, /app-shell/);

    assert.equal(js.statusCode, 200);
    assert.match(js.headers["content-type"] as string, /javascript/);
    assert.match(js.body, /sessionStorage/);
  });

  it("keeps management APIs protected while the UI shell is public", async () => {
    const ui = await app.inject({ method: "GET", url: "/ui/" });
    const missing = await app.inject({ method: "GET", url: "/api/v1/projects" });
    const invalid = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      headers: { authorization: "Bearer invalid" },
    });

    assert.equal(ui.statusCode, 200);
    assert.equal(missing.statusCode, 401);
    assert.equal(invalid.statusCode, 401);
  });
});
