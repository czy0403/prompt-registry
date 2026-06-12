import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { buildApp } from "../src/app.js";
import { createPool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrate.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://prompt_registry:prompt_registry@localhost:5432/prompt_registry";

describe("Prompt Registry API", () => {
  let pool: pg.Pool;
  let app: FastifyInstance;
  const projectId = randomUUID();
  const userId = randomUUID();

  before(async () => {
    pool = createPool(databaseUrl);
    await runMigrations(pool);
    app = buildApp(pool, false);
    await app.ready();
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE prompt_label_history, prompt_label, prompt_version, prompt CASCADE",
    );
  });

  after(async () => {
    await app.close();
    await pool.end();
  });

  async function createPrompt() {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: { "x-user-id": userId },
      payload: {
        prompt_key: "customer-answer",
        name: "Customer Answer",
        type: "chat",
        content: [{ role: "system", content: "Version 1" }],
        model_config: { temperature: 0.2 },
        commit_message: "Initial version",
      },
    });
    assert.equal(response.statusCode, 201);
    return response.json<{ id: string }>();
  }

  async function createVersion(promptId: string, content: string) {
    return app.inject({
      method: "POST",
      url: `/api/v1/prompts/${promptId}/versions`,
      headers: { "x-user-id": userId },
      payload: {
        content: [{ role: "system", content }],
        model_config: { temperature: 0.1 },
        commit_message: content,
      },
    });
  }

  it("creates immutable versions and automatically moves latest", async () => {
    const prompt = await createPrompt();
    const versionResponse = await createVersion(prompt.id, "Version 2");
    assert.equal(versionResponse.statusCode, 201);
    assert.equal(versionResponse.json<{ version: number }>().version, 2);

    const labels = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${prompt.id}/labels`,
    });
    assert.equal(labels.json<Array<{ label: string; version: number }>>()[0]?.label, "latest");
    assert.equal(labels.json<Array<{ label: string; version: number }>>()[0]?.version, 2);

    const v1 = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${prompt.id}/versions/1`,
    });
    assert.equal(v1.json<{ version: number }>().version, 1);
    assert.deepEqual(v1.json<{ content: unknown }>().content, [
      { role: "system", content: "Version 1" },
    ]);

    await assert.rejects(
      pool.query(
        "UPDATE prompt_version SET commit_message = 'mutated' WHERE prompt_id = $1",
        [prompt.id],
      ),
      /prompt versions are immutable/,
    );
  });

  it("publishes and rolls back production with complete history", async () => {
    const prompt = await createPrompt();
    await createVersion(prompt.id, "Version 2");

    const publish = await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${prompt.id}/labels/production`,
      headers: { "x-user-id": userId },
      payload: {
        version: 2,
        expected_current_version: null,
        reason: "Publish version 2",
      },
    });
    assert.equal(publish.statusCode, 200);
    assert.equal(publish.json<{ label: string }>().label, "production");
    assert.equal(publish.json<{ version: number }>().version, 2);

    const rollback = await app.inject({
      method: "POST",
      url: `/api/v1/prompts/${prompt.id}/labels/production/rollback`,
      headers: { "x-user-id": userId },
      payload: {
        version: 1,
        expected_current_version: 2,
        reason: "Rollback version 2",
      },
    });
    assert.equal(rollback.statusCode, 200);
    assert.equal(rollback.json<{ label: string }>().label, "production");
    assert.equal(rollback.json<{ version: number }>().version, 1);

    const history = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${prompt.id}/labels/production/history`,
    });
    const historyItems = history.json<
      Array<{
        action: string;
        from_version: number | null;
        to_version: number;
      }>
    >();
    assert.deepEqual(
      historyItems.map(({ action, from_version, to_version }) => ({
        action,
        from_version,
        to_version,
      })),
      [
        { action: "rollback", from_version: 2, to_version: 1 },
        { action: "publish", from_version: null, to_version: 2 },
      ],
    );
  });

  it("rejects a publish based on a stale expected version", async () => {
    const prompt = await createPrompt();
    await createVersion(prompt.id, "Version 2");

    const firstPublish = await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${prompt.id}/labels/production`,
      headers: { "x-user-id": userId },
      payload: { version: 1, expected_current_version: null },
    });
    assert.equal(firstPublish.statusCode, 200);

    const stalePublish = await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${prompt.id}/labels/production`,
      headers: { "x-user-id": userId },
      payload: { version: 2, expected_current_version: null },
    });
    assert.equal(stalePublish.statusCode, 409);
    assert.deepEqual(stalePublish.json(), {
      error: {
        code: "conflict",
        message: "Label changed since it was last read.",
        details: {
          expected_current_version: null,
          actual_current_version: 1,
        },
      },
    });
  });

  it("serializes concurrent version creation without duplicate versions", async () => {
    const prompt = await createPrompt();
    const responses = await Promise.all([
      createVersion(prompt.id, "Concurrent A"),
      createVersion(prompt.id, "Concurrent B"),
    ]);

    assert.deepEqual(
      responses.map((response) => response.statusCode),
      [201, 201],
    );

    const versions = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${prompt.id}/versions`,
    });
    assert.deepEqual(
      versions.json<Array<{ version: number }>>().map((item) => item.version),
      [3, 2, 1],
    );
  });

  it("prevents manual movement of latest", async () => {
    const prompt = await createPrompt();
    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${prompt.id}/labels/latest`,
      headers: { "x-user-id": userId },
      payload: { version: 1, expected_current_version: 1 },
    });
    assert.equal(response.statusCode, 400);
  });

  it("archives prompts instead of deleting versions", async () => {
    const prompt = await createPrompt();
    const archive = await app.inject({
      method: "DELETE",
      url: `/api/v1/prompts/${prompt.id}`,
      headers: { "x-user-id": userId },
    });
    assert.equal(archive.statusCode, 204);

    const createArchivedVersion = await createVersion(prompt.id, "Version 2");
    assert.equal(createArchivedVersion.statusCode, 409);

    const versions = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${prompt.id}/versions`,
    });
    assert.deepEqual(
      versions.json<Array<{ version: number }>>().map((item) => item.version),
      [1],
    );
  });
});
