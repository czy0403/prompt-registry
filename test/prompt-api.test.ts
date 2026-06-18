import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { buildApp } from "../src/app.js";
import { runMigrations } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL or DATABASE_URL is required.");
}
const adminToken = "test-admin-token-that-is-at-least-32-chars";
const adminActorId = randomUUID();

describe("Prompt Registry API", () => {
  let pool: pg.Pool;
  let app: FastifyInstance;
  let projectId: string;

  const adminHeaders = {
    authorization: `Bearer ${adminToken}`,
  };

  before(async () => {
    pool = createPool(databaseUrl);
    await runMigrations(pool);
    app = buildApp(pool, { adminApiToken: adminToken, adminActorId }, false);
    await app.ready();
  });

  async function cleanTestData() {
    await pool.query(
      `TRUNCATE
         project_api_token, prompt_label_history, prompt_label, prompt_version,
         prompt, project
       CASCADE`,
    );
  }

  beforeEach(async () => {
    await cleanTestData();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders,
      payload: { name: "Customer Support" },
    });
    assert.equal(response.statusCode, 201);
    projectId = response.json<{ id: string }>().id;
  });

  afterEach(async () => {
    await cleanTestData();
  });

  after(async () => {
    await app.close();
    await pool.end();
  });

  async function createPrompt(
    key = "customer-answer",
    targetProjectId = projectId,
  ) {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${targetProjectId}/prompts`,
      headers: adminHeaders,
      payload: {
        prompt_key: key,
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
      headers: adminHeaders,
      payload: {
        content: [{ role: "system", content }],
        model_config: { temperature: 0.1 },
        commit_message: content,
      },
    });
  }

  async function publish(promptId: string, label = "production", version = 1) {
    return app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${promptId}/labels/${label}`,
      headers: adminHeaders,
      payload: {
        version,
        expected_current_version: null,
        reason: `Publish ${label}`,
      },
    });
  }

  async function createProjectToken(
    targetProjectId = projectId,
    name = "customer-service",
  ) {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${targetProjectId}/api-tokens`,
      headers: adminHeaders,
      payload: { name },
    });
    assert.equal(response.statusCode, 201);
    return response.json<{ id: string; token: string; token_prefix: string }>();
  }

  async function labelHistory(promptId: string, label: string) {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${promptId}/labels/${label}/history`,
      headers: adminHeaders,
    });
    assert.equal(response.statusCode, 200);
    return response.json<
      Array<{
        action: string;
        from_version: number | null;
        to_version: number;
        reason: string | null;
        created_by: string;
      }>
    >();
  }

  it("reports health", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: "ok" });
  });

  it("requires the administrator token for every management API", async () => {
    const missing = await app.inject({ method: "GET", url: "/api/v1/projects" });
    const invalid = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      headers: { authorization: "Bearer invalid" },
    });
    const valid = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      headers: adminHeaders,
    });

    assert.equal(missing.statusCode, 401);
    assert.equal(invalid.statusCode, 401);
    assert.equal(valid.statusCode, 200);
  });

  it("manages projects and prevents changes after archive", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders,
      payload: { name: "Empty Description" },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json<{ description: string }>().description, "");

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      headers: adminHeaders,
    });
    assert.equal(
      list.json<Array<{ id: string }>>().some((project) => project.id === projectId),
      true,
    );

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}`,
      headers: adminHeaders,
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json<{ name: string }>().name, "Customer Support");

    const update = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: adminHeaders,
      payload: { name: "Support", description: "Production prompts" },
    });
    assert.equal(update.statusCode, 200);
    assert.equal(update.json<{ name: string }>().name, "Support");
    assert.equal(update.json<{ description: string }>().description, "Production prompts");

    const prompt = await createPrompt();
    const archive = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: adminHeaders,
    });
    assert.equal(archive.statusCode, 204);

    const updateArchived = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: adminHeaders,
      payload: { description: "Blocked" },
    });
    assert.equal(updateArchived.statusCode, 409);

    const createToken = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/api-tokens`,
      headers: adminHeaders,
      payload: { name: "blocked-client" },
    });
    assert.equal(createToken.statusCode, 409);

    const create = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
      payload: {
        prompt_key: "blocked",
        name: "Blocked",
        type: "text",
        content: "Blocked",
      },
    });
    assert.equal(create.statusCode, 404);

    const updatePrompt = await app.inject({
      method: "PATCH",
      url: `/api/v1/prompts/${prompt.id}`,
      headers: adminHeaders,
      payload: { description: "Blocked" },
    });
    assert.equal(updatePrompt.statusCode, 404);

    const version = await createVersion(prompt.id, "Blocked");
    assert.equal(version.statusCode, 404);

    const label = await publish(prompt.id);
    assert.equal(label.statusCode, 404);
  });

  it("manages prompt metadata, archive visibility, and prompt key uniqueness", async () => {
    const prompt = await createPrompt();

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${prompt.id}`,
      headers: adminHeaders,
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json<{ prompt_key: string }>().prompt_key, "customer-answer");
    assert.equal(detail.json<{ labels: Array<{ label: string }> }>().labels[0]?.label, "latest");

    const update = await app.inject({
      method: "PATCH",
      url: `/api/v1/prompts/${prompt.id}`,
      headers: adminHeaders,
      payload: { name: "Customer Answer v2", description: "Updated copy" },
    });
    assert.equal(update.statusCode, 200);
    assert.equal(update.json<{ name: string }>().name, "Customer Answer v2");
    assert.equal(update.json<{ description: string }>().description, "Updated copy");

    const duplicate = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
      payload: {
        prompt_key: "customer-answer",
        name: "Duplicate",
        type: "text",
        content: "Duplicate",
      },
    });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(duplicate.json<{ error: { code: string } }>().error.code, "conflict");

    const otherProject = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders,
      payload: { name: "Other Project" },
    });
    assert.equal(otherProject.statusCode, 201);
    await createPrompt("customer-answer", otherProject.json<{ id: string }>().id);

    const activeList = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
    });
    assert.deepEqual(
      activeList.json<Array<{ prompt_key: string }>>().map((item) => item.prompt_key),
      ["customer-answer"],
    );

    const archive = await app.inject({
      method: "DELETE",
      url: `/api/v1/prompts/${prompt.id}`,
      headers: adminHeaders,
    });
    assert.equal(archive.statusCode, 204);

    const activeAfterArchive = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
    });
    assert.deepEqual(activeAfterArchive.json(), []);

    const withArchived = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/prompts?include_archived=true`,
      headers: adminHeaders,
    });
    assert.deepEqual(
      withArchived.json<Array<{ prompt_key: string; archived_at: string | null }>>()
        .map(({ prompt_key, archived_at }) => ({
          prompt_key,
          archived: archived_at !== null,
        })),
      [{ prompt_key: "customer-answer", archived: true }],
    );
  });

  it("creates immutable versions and automatically moves latest", async () => {
    const prompt = await createPrompt();
    const versionResponse = await createVersion(prompt.id, "Version 2");
    assert.equal(versionResponse.statusCode, 201);
    assert.equal(versionResponse.json<{ version: number }>().version, 2);

    const labels = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${prompt.id}/labels`,
      headers: adminHeaders,
    });
    assert.equal(labels.json<Array<{ label: string; version: number }>>()[0]?.label, "latest");
    assert.equal(labels.json<Array<{ label: string; version: number }>>()[0]?.version, 2);

    await assert.rejects(
      pool.query(
        "UPDATE prompt_version SET commit_message = 'mutated' WHERE prompt_id = $1",
        [prompt.id],
      ),
      /prompt versions are immutable/,
    );
    await assert.rejects(
      pool.query("DELETE FROM prompt_version WHERE prompt_id = $1", [prompt.id]),
      /prompt versions are immutable/,
    );
  });

  it("permanently deletes archived prompts only", async () => {
    const prompt = await createPrompt();
    await createVersion(prompt.id, "Version 2");
    assert.equal((await publish(prompt.id, "production", 2)).statusCode, 200);

    const activeDelete = await app.inject({
      method: "DELETE",
      url: `/api/v1/prompts/${prompt.id}/permanent`,
      headers: adminHeaders,
    });
    assert.equal(activeDelete.statusCode, 409);

    const archive = await app.inject({
      method: "DELETE",
      url: `/api/v1/prompts/${prompt.id}`,
      headers: adminHeaders,
    });
    assert.equal(archive.statusCode, 204);

    const permanent = await app.inject({
      method: "DELETE",
      url: `/api/v1/prompts/${prompt.id}/permanent`,
      headers: adminHeaders,
    });
    assert.equal(permanent.statusCode, 200);
    assert.equal(permanent.json<{ deleted_versions: number }>().deleted_versions, 2);
    assert.equal(permanent.json<{ deleted_labels: number }>().deleted_labels, 2);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${prompt.id}`,
      headers: adminHeaders,
    });
    assert.equal(detail.statusCode, 404);

    const versions = await pool.query(
      "SELECT count(*)::int AS count FROM prompt_version WHERE prompt_id = $1",
      [prompt.id],
    );
    assert.equal(versions.rows[0]?.count, 0);
  });

  it("permanently deletes archived projects and their dependent data", async () => {
    const prompt = await createPrompt();
    await createVersion(prompt.id, "Version 2");
    assert.equal((await publish(prompt.id, "production", 2)).statusCode, 200);
    const token = await createProjectToken();

    const activeDelete = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/permanent`,
      headers: adminHeaders,
    });
    assert.equal(activeDelete.statusCode, 409);

    const archive = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: adminHeaders,
    });
    assert.equal(archive.statusCode, 204);

    const permanent = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/permanent`,
      headers: adminHeaders,
    });
    assert.equal(permanent.statusCode, 200);
    assert.equal(permanent.json<{ deleted_prompts: number }>().deleted_prompts, 1);
    assert.equal(permanent.json<{ deleted_versions: number }>().deleted_versions, 2);
    assert.equal(permanent.json<{ deleted_api_tokens: number }>().deleted_api_tokens, 1);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}`,
      headers: adminHeaders,
    });
    assert.equal(detail.statusCode, 404);

    const publicRead = await app.inject({
      method: "GET",
      url: "/api/public/v1/prompts/customer-answer",
      headers: { authorization: `Bearer ${token.token}` },
    });
    assert.equal(publicRead.statusCode, 401);
  });

  it("publishes and rolls back production with complete history", async () => {
    const prompt = await createPrompt();
    await createVersion(prompt.id, "Version 2");
    const published = await publish(prompt.id, "production", 2);
    assert.equal(published.statusCode, 200);

    const rollback = await app.inject({
      method: "POST",
      url: `/api/v1/prompts/${prompt.id}/labels/production/rollback`,
      headers: adminHeaders,
      payload: {
        version: 1,
        expected_current_version: 2,
        reason: "Rollback version 2",
      },
    });
    assert.equal(rollback.statusCode, 200);

    const history = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${prompt.id}/labels/production/history`,
      headers: adminHeaders,
    });
    assert.deepEqual(
      history
        .json<Array<{ action: string; from_version: number | null; to_version: number }>>()
        .map(({ action, from_version, to_version }) => ({
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

  it("does not duplicate label history when publishing the current version", async () => {
    const prompt = await createPrompt();
    assert.equal((await publish(prompt.id)).statusCode, 200);

    const noop = await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${prompt.id}/labels/production`,
      headers: adminHeaders,
      payload: {
        version: 1,
        expected_current_version: 1,
        reason: "Already current",
      },
    });
    assert.equal(noop.statusCode, 200);
    assert.equal(noop.json<{ version: number }>().version, 1);

    const history = await labelHistory(prompt.id, "production");
    assert.deepEqual(
      history.map(({ action, from_version, to_version, reason, created_by }) => ({
        action,
        from_version,
        to_version,
        reason,
        created_by,
      })),
      [
        {
          action: "publish",
          from_version: null,
          to_version: 1,
          reason: "Publish production",
          created_by: adminActorId,
        },
      ],
    );
  });

  it("rejects stale publishes and manual movement of latest", async () => {
    const prompt = await createPrompt();
    await createVersion(prompt.id, "Version 2");
    assert.equal((await publish(prompt.id)).statusCode, 200);

    const stale = await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${prompt.id}/labels/production`,
      headers: adminHeaders,
      payload: { version: 2, expected_current_version: null },
    });
    assert.equal(stale.statusCode, 409);

    const latest = await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${prompt.id}/labels/latest`,
      headers: adminHeaders,
      payload: { version: 1, expected_current_version: 2 },
    });
    assert.equal(latest.statusCode, 400);
  });

  it("rejects missing label targets and stale rollbacks", async () => {
    const prompt = await createPrompt();
    await createVersion(prompt.id, "Version 2");

    const missingPublishTarget = await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${prompt.id}/labels/production`,
      headers: adminHeaders,
      payload: { version: 99, expected_current_version: null },
    });
    assert.equal(missingPublishTarget.statusCode, 404);

    assert.equal((await publish(prompt.id, "production", 2)).statusCode, 200);

    const staleRollback = await app.inject({
      method: "POST",
      url: `/api/v1/prompts/${prompt.id}/labels/production/rollback`,
      headers: adminHeaders,
      payload: {
        version: 1,
        expected_current_version: 1,
        reason: "Stale rollback",
      },
    });
    assert.equal(staleRollback.statusCode, 409);
    assert.deepEqual(staleRollback.json<{ error: { details: unknown } }>().error.details, {
      expected_current_version: 1,
      actual_current_version: 2,
    });

    const latestRollback = await app.inject({
      method: "POST",
      url: `/api/v1/prompts/${prompt.id}/labels/latest/rollback`,
      headers: adminHeaders,
      payload: {
        version: 1,
        expected_current_version: 2,
      },
    });
    assert.equal(latestRollback.statusCode, 400);
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
      headers: adminHeaders,
    });
    assert.deepEqual(
      versions.json<Array<{ version: number }>>().map((item) => item.version),
      [3, 2, 1],
    );
  });

  it("returns stable errors for missing, archived, and inaccessible versions", async () => {
    const prompt = await createPrompt();

    const missingPrompt = await createVersion(randomUUID(), "Missing prompt");
    assert.equal(missingPrompt.statusCode, 404);

    const missingVersion = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${prompt.id}/versions/99`,
      headers: adminHeaders,
    });
    assert.equal(missingVersion.statusCode, 404);

    const archive = await app.inject({
      method: "DELETE",
      url: `/api/v1/prompts/${prompt.id}`,
      headers: adminHeaders,
    });
    assert.equal(archive.statusCode, 204);

    const archivedPromptVersion = await createVersion(prompt.id, "Archived prompt");
    assert.equal(archivedPromptVersion.statusCode, 409);

    const projectPrompt = await createPrompt("project-archive-blocked");
    const archiveProject = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: adminHeaders,
    });
    assert.equal(archiveProject.statusCode, 204);

    const archivedProjectVersion = await createVersion(
      projectPrompt.id,
      "Archived project",
    );
    assert.equal(archivedProjectVersion.statusCode, 404);
  });

  it("extracts variables for text and chat prompt versions", async () => {
    const textPrompt = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
      payload: {
        prompt_key: "welcome-text",
        name: "Welcome Text",
        type: "text",
        content: "Hello {{name}}, your plan is {{plan}}. Hi again {{name}}.",
      },
    });
    assert.equal(textPrompt.statusCode, 201);
    const textVersion = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${textPrompt.json<{ id: string }>().id}/versions/1`,
      headers: adminHeaders,
    });
    assert.deepEqual(textVersion.json<{ variables: string[] }>().variables, [
      "name",
      "plan",
    ]);

    const chat = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
      payload: {
        prompt_key: "support-chat",
        name: "Support Chat",
        type: "chat",
        content: [
          { role: "system", content: "Use {{tone}} tone." },
          { role: "user", content: "Question: {{question}} from {{user_name1}}" },
        ],
      },
    });
    assert.equal(chat.statusCode, 201);
    const chatVersion = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${chat.json<{ id: string }>().id}/versions/1`,
      headers: adminHeaders,
    });
    assert.deepEqual(chatVersion.json<{ variables: string[] }>().variables, [
      "tone",
      "question",
      "user_name1",
    ]);
  });

  it("rejects invalid prompt variables", async () => {
    const invalidCases = [
      { content: "Hello {{}}", message: "empty variable" },
      { content: "Hello {{user-name}}", message: "invalid variable name" },
      { content: "Hello {{user.name}}", message: "unsupported dotted variable" },
      { content: "Hello {{question", message: "unclosed variable" },
      { content: "Hello question}}", message: "closing variable without opening" },
    ];

    for (const item of invalidCases) {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/prompts`,
        headers: adminHeaders,
        payload: {
          prompt_key: `invalid-${invalidCases.indexOf(item)}`,
          name: item.message,
          type: "text",
          content: item.content,
        },
      });
      assert.equal(response.statusCode, 400, item.message);
    }
  });

  it("validates prompt content, model config, prompt keys, and labels", async () => {
    const invalidProjectName = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders,
      payload: { name: "1`" },
    });
    assert.equal(invalidProjectName.statusCode, 400);

    const validLocalizedProjectName = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders,
      payload: { name: "客服项目 1" },
    });
    assert.equal(validLocalizedProjectName.statusCode, 201);

    const invalidTextContent = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
      payload: {
        prompt_key: "bad-text-content",
        name: "Bad Text Content",
        type: "text",
        content: [{ role: "user", content: "Not text" }],
      },
    });
    assert.equal(invalidTextContent.statusCode, 400);

    const invalidChatContent = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
      payload: {
        prompt_key: "bad-chat-content",
        name: "Bad Chat Content",
        type: "chat",
        content: "Not chat",
      },
    });
    assert.equal(invalidChatContent.statusCode, 400);

    const invalidModelConfig = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
      payload: {
        prompt_key: "bad-model-config",
        name: "Bad Model Config",
        type: "text",
        content: "Hello",
        model_config: ["not", "an", "object"],
      },
    });
    assert.equal(invalidModelConfig.statusCode, 400);
    assert.equal(
      invalidModelConfig.json<{ error: { code: string } }>().error.code,
      "validation_error",
    );

    const invalidPromptName = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
      payload: {
        prompt_key: "bad-prompt-name",
        name: "1`",
        type: "text",
        content: "Hello",
      },
    });
    assert.equal(invalidPromptName.statusCode, 400);

    const invalidCommitMessage = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
      payload: {
        prompt_key: "bad-commit-message",
        name: "Bad Commit Message",
        type: "text",
        content: "Hello",
        commit_message: "bad\u0001message",
      },
    });
    assert.equal(invalidCommitMessage.statusCode, 400);

    const invalidPromptContentCharacter = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
      payload: {
        prompt_key: "bad-content-character",
        name: "Bad Content Character",
        type: "text",
        content: "Hello\u0001",
      },
    });
    assert.equal(invalidPromptContentCharacter.statusCode, 400);

    const invalidPromptKey = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
      payload: {
        prompt_key: "-invalid",
        name: "Invalid Key",
        type: "text",
        content: "Hello",
      },
    });
    assert.equal(invalidPromptKey.statusCode, 400);

    const validPromptKey = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
      payload: {
        prompt_key: "Team.Path/name-1",
        name: "Valid Key",
        type: "text",
        content: "Hello",
      },
    });
    assert.equal(validPromptKey.statusCode, 201);

    const invalidLabel = await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${validPromptKey.json<{ id: string }>().id}/labels/Production`,
      headers: adminHeaders,
      payload: { version: 1, expected_current_version: null },
    });
    assert.equal(invalidLabel.statusCode, 400);

    const validLabel = await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${validPromptKey.json<{ id: string }>().id}/labels/prod.v1-1`,
      headers: adminHeaders,
      payload: { version: 1, expected_current_version: null },
    });
    assert.equal(validLabel.statusCode, 200);

    const invalidTokenName = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/api-tokens`,
      headers: adminHeaders,
      payload: { name: "client`1" },
    });
    assert.equal(invalidTokenName.statusCode, 400);
  });

  it("shows a project token once, lists metadata, and revokes it", async () => {
    const token = await createProjectToken();
    assert.match(token.token, /^prj_/);

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/api-tokens`,
      headers: adminHeaders,
    });
    const listed = list.json<Array<Record<string, unknown>>>();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.token_prefix, token.token_prefix);
    assert.equal("token" in (listed[0] ?? {}), false);
    assert.equal("token_hash" in (listed[0] ?? {}), false);

    const revoke = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/api-tokens/${token.id}`,
      headers: adminHeaders,
    });
    assert.equal(revoke.statusCode, 204);

    const activeList = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/api-tokens`,
      headers: adminHeaders,
    });
    assert.deepEqual(activeList.json(), []);

    const historyList = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/api-tokens?include_revoked=true`,
      headers: adminHeaders,
    });
    assert.equal(
      historyList.json<Array<{ revoked_at: string | null }>>()[0]?.revoked_at === null,
      false,
    );

    const publicRead = await app.inject({
      method: "GET",
      url: "/api/public/v1/prompts/customer-answer",
      headers: { authorization: `Bearer ${token.token}` },
    });
    assert.equal(publicRead.statusCode, 401);
  });

  it("rejects invalid public tokens and updates last used time for valid tokens", async () => {
    const prompt = await createPrompt();
    assert.equal((await publish(prompt.id)).statusCode, 200);
    const token = await createProjectToken();

    const missing = await app.inject({
      method: "GET",
      url: "/api/public/v1/prompts/customer-answer",
    });
    assert.equal(missing.statusCode, 401);

    const invalid = await app.inject({
      method: "GET",
      url: "/api/public/v1/prompts/customer-answer",
      headers: { authorization: "Bearer invalid" },
    });
    assert.equal(invalid.statusCode, 401);

    const beforeRead = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/api-tokens`,
      headers: adminHeaders,
    });
    assert.equal(
      beforeRead.json<Array<{ last_used_at: string | null }>>()[0]?.last_used_at,
      null,
    );

    const read = await app.inject({
      method: "GET",
      url: "/api/public/v1/prompts/customer-answer",
      headers: { authorization: `Bearer ${token.token}` },
    });
    assert.equal(read.statusCode, 200);

    const afterRead = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/api-tokens`,
      headers: adminHeaders,
    });
    assert.notEqual(
      afterRead.json<Array<{ last_used_at: string | null }>>()[0]?.last_used_at,
      null,
    );

    const revoked = await createProjectToken(projectId, "revoked-client");
    await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/api-tokens/${revoked.id}`,
      headers: adminHeaders,
    });
    const revokedRead = await app.inject({
      method: "GET",
      url: "/api/public/v1/prompts/customer-answer",
      headers: { authorization: `Bearer ${revoked.token}` },
    });
    assert.equal(revokedRead.statusCode, 401);
  });

  it("enforces unique active token names and allows reuse after revoke", async () => {
    const first = await createProjectToken(projectId, "production-client");

    const duplicate = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/api-tokens`,
      headers: adminHeaders,
      payload: { name: "production-client" },
    });
    assert.equal(duplicate.statusCode, 409);

    await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/api-tokens/${first.id}`,
      headers: adminHeaders,
    });
    const replacement = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/api-tokens`,
      headers: adminHeaders,
      payload: { name: "production-client" },
    });
    assert.equal(replacement.statusCode, 201);
  });

  it("serializes concurrent API token creation with the same name", async () => {
    const responses = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/api-tokens`,
        headers: adminHeaders,
        payload: { name: "concurrent-client" },
      }),
      app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/api-tokens`,
        headers: adminHeaders,
        payload: { name: "concurrent-client" },
      }),
    ]);

    assert.deepEqual(
      responses.map((response) => response.statusCode).sort(),
      [201, 409],
    );
  });

  it("limits each project to 20 active API tokens", async () => {
    for (let index = 1; index <= 20; index += 1) {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/api-tokens`,
        headers: adminHeaders,
        payload: { name: `client-${index}` },
      });
      assert.equal(response.statusCode, 201);
    }

    const overLimit = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/api-tokens`,
      headers: adminHeaders,
      payload: { name: "client-21" },
    });
    assert.equal(overLimit.statusCode, 409);
    assert.deepEqual(overLimit.json(), {
      error: {
        code: "conflict",
        message: "Project API token limit reached.",
        details: { maximum_active_tokens: 20 },
      },
    });
  });

  it("returns not found when listing tokens for an unknown project", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${randomUUID()}/api-tokens`,
      headers: adminHeaders,
    });

    assert.equal(response.statusCode, 404);
  });

  it("reads published prompts by project token and label", async () => {
    const prompt = await createPrompt();
    assert.equal((await publish(prompt.id)).statusCode, 200);
    assert.equal((await publish(prompt.id, "staging")).statusCode, 200);
    const token = await createProjectToken();

    const production = await app.inject({
      method: "GET",
      url: "/api/public/v1/prompts/customer-answer",
      headers: { authorization: `Bearer ${token.token}` },
    });
    const productionBody = production.json<Record<string, unknown>>();
    assert.equal(production.statusCode, 200);
    assert.equal(productionBody.label, "production");
    assert.equal(productionBody.version, 1);
    assert.deepEqual(productionBody.variables, []);

    const variablePrompt = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/prompts`,
      headers: adminHeaders,
      payload: {
        prompt_key: "customer-answer-with-vars",
        name: "Customer Answer With Vars",
        type: "chat",
        content: [
          { role: "system", content: "Use a {{tone}} tone." },
          { role: "user", content: "{{question}}" },
        ],
      },
    });
    assert.equal(variablePrompt.statusCode, 201);
    assert.equal(
      (await publish(variablePrompt.json<{ id: string }>().id)).statusCode,
      200,
    );
    const variablePublicPrompt = await app.inject({
      method: "GET",
      url: "/api/public/v1/prompts/customer-answer-with-vars",
      headers: { authorization: `Bearer ${token.token}` },
    });
    assert.deepEqual(variablePublicPrompt.json<{ variables: string[] }>().variables, [
      "tone",
      "question",
    ]);

    const management = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      headers: { authorization: `Bearer ${token.token}` },
    });
    assert.equal(management.statusCode, 401);

    const staging = await app.inject({
      method: "GET",
      url: "/api/public/v1/prompts/customer-answer?label=staging",
      headers: { authorization: `Bearer ${token.token}` },
    });
    assert.equal(staging.statusCode, 200);
    assert.equal(staging.json<{ label: string }>().label, "staging");

    const latest = await app.inject({
      method: "GET",
      url: "/api/public/v1/prompts/customer-answer?label=latest",
      headers: { authorization: `Bearer ${token.token}` },
    });
    assert.equal(latest.statusCode, 400);

    const version = await app.inject({
      method: "GET",
      url: "/api/public/v1/prompts/customer-answer?version=1",
      headers: { authorization: `Bearer ${token.token}` },
    });
    assert.equal(version.statusCode, 400);
  });

  it("returns only content and model config diffs for versions", async () => {
    const prompt = await createPrompt();
    await createVersion(prompt.id, "Version {{next_version}}");
    const diff = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${prompt.id}/versions/2/diff?base_version=1`,
      headers: adminHeaders,
    });
    const body = diff.json<Record<string, unknown>>();
    assert.equal(diff.statusCode, 200);
    assert.equal("content" in body, true);
    assert.equal("model_config" in body, true);
  });

  it("handles diff error cases and same-version diffs", async () => {
    const prompt = await createPrompt();

    const missingBase = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${prompt.id}/versions/1/diff?base_version=99`,
      headers: adminHeaders,
    });
    assert.equal(missingBase.statusCode, 404);

    const invalidBase = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${prompt.id}/versions/1/diff?base_version=0`,
      headers: adminHeaders,
    });
    assert.equal(invalidBase.statusCode, 400);

    const sameVersion = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${prompt.id}/versions/1/diff?base_version=1`,
      headers: adminHeaders,
    });
    assert.equal(sameVersion.statusCode, 200);
    assert.deepEqual(sameVersion.json<{ content: unknown[] }>().content, []);
    assert.deepEqual(sameVersion.json<{ model_config: unknown[] }>().model_config, []);
  });

  it("keeps migrations idempotent and enforces label ownership at the database level", async () => {
    await runMigrations(pool);

    const first = await createPrompt("first-owner");
    const second = await createPrompt("second-owner");
    const secondVersion = await pool.query<{ id: string }>(
      "SELECT id FROM prompt_version WHERE prompt_id = $1 AND version = 1",
      [second.id],
    );

    await assert.rejects(
      pool.query(
        `INSERT INTO prompt_label (
           prompt_id, label, version_id, updated_by
         ) VALUES ($1, $2, $3, $4)`,
        [first.id, "wrong-owner", secondVersion.rows[0]?.id, adminActorId],
      ),
      /label version does not belong to prompt/,
    );
  });

  it("isolates project tokens and hides archived prompts and projects", async () => {
    const prompt = await createPrompt();
    await publish(prompt.id);

    const otherProject = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders,
      payload: { name: "Other" },
    });
    const otherProjectId = otherProject.json<{ id: string }>().id;
    const otherToken = await createProjectToken(otherProjectId);

    const isolated = await app.inject({
      method: "GET",
      url: "/api/public/v1/prompts/customer-answer",
      headers: { authorization: `Bearer ${otherToken.token}` },
    });
    assert.equal(isolated.statusCode, 404);

    const token = await createProjectToken();
    await app.inject({
      method: "DELETE",
      url: `/api/v1/prompts/${prompt.id}`,
      headers: adminHeaders,
    });
    const archivedPrompt = await app.inject({
      method: "GET",
      url: "/api/public/v1/prompts/customer-answer",
      headers: { authorization: `Bearer ${token.token}` },
    });
    assert.equal(archivedPrompt.statusCode, 404);

    await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: adminHeaders,
    });
    const archivedProject = await app.inject({
      method: "GET",
      url: "/api/public/v1/prompts/customer-answer",
      headers: { authorization: `Bearer ${token.token}` },
    });
    assert.equal(archivedProject.statusCode, 404);
  });
});
