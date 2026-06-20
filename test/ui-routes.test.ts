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
    assert.match(response.body, /prompt-registry/);
    assert.match(response.body, /data-testid="prompt-registry-shell"/);
    assert.match(
      response.headers["content-security-policy"] as string,
      /script-src 'self'/,
    );
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["referrer-policy"], "no-referrer");
    assert.equal(response.headers["cache-control"], "no-store");
    assert.match(response.body, /aria-live="polite"/);
  });

  it("serves fixed CSS and JavaScript assets", async () => {
    const css = await app.inject({ method: "GET", url: "/ui/app.css" });
    const js = await app.inject({ method: "GET", url: "/ui/app.js" });

    assert.equal(css.statusCode, 200);
    assert.match(css.headers["content-type"] as string, /text\/css/);
    assert.match(css.body, /app-shell/);
    assert.match(css.body, /sidebar/);
    assert.match(css.body, /toast-root/);
    assert.match(css.body, /position: fixed/);
    assert.match(css.body, /version-meta-strip/);
    assert.match(css.body, /diff-caption/);

    assert.equal(js.statusCode, 200);
    assert.match(js.headers["content-type"] as string, /javascript/);
    assert.match(js.body, /sessionStorage/);
    assert.match(js.body, /DEFAULT_LABELS/);
    assert.match(js.body, /brand-subtitle">v0\.1\.0/);
    assert.doesNotMatch(js.body, /admin console/);
    assert.match(js.body, /function brandMark/);
    assert.match(js.body, /brand-svg/);
    assert.doesNotMatch(js.body, /brand-mark">\$\{icon\("terminal"\)\}/);
    assert.match(js.body, /publishSelectedVersion/);
    assert.match(js.body, /data-menu-trigger/);
    assert.match(js.body, /function bindMenus/);
    assert.match(js.body, /function positionMenu/);
    assert.match(js.body, /与其它版本对比：/);
    assert.match(js.body, /差异对比/);
    assert.match(js.body, /从 v/);
    assert.doesNotMatch(js.body, /id="editPromptButton"/);
    assert.match(js.body, /api-tokens`\)/);
    assert.match(js.body, /id="tokenForm"/);
    assert.match(js.body, /form="tokenForm"/);
    assert.match(js.body, /tokenForm"\)\.addEventListener\("submit"/);
    assert.match(js.body, /function fallbackCopyText/);
    assert.match(js.body, /document\.execCommand\("copy"\)/);
    assert.doesNotMatch(js.body, /include_revoked=true/);
    assert.doesNotMatch(js.body, /已吊销<\/span>/);
    assert.match(js.body, /newProjectButton"\)\.addEventListener\("click", \(\) => openProjectModal\(\)\)/);
    assert.doesNotMatch(js.body, /newProjectButton"\)\.addEventListener\("click", openProjectModal\)/);
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
