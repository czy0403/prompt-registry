import { randomUUID } from "node:crypto";
import type pg from "pg";
import { withTransaction } from "../db/transaction.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { diffJson } from "../lib/json-diff.js";
import type {
  CreatePromptInput,
  MoveLabelInput,
  VersionContentInput,
} from "./types.js";

type PromptRow = {
  id: string;
  project_id: string;
  prompt_key: string;
  name: string;
  description: string;
  type: "text" | "chat";
  archived_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

type PromptVersionRow = {
  id: string;
  prompt_id: string;
  version: number;
  content: unknown;
  model_config: Record<string, unknown>;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
  commit_message: string | null;
  created_by: string;
  created_at: Date;
};

type LabelRow = {
  label: string;
  version: number;
  revision: string;
  updated_by: string;
  updated_at: Date;
};

function asJson(value: unknown): string {
  return JSON.stringify(value);
}

export class PromptService {
  constructor(private readonly pool: pg.Pool) {}

  async createPrompt(input: CreatePromptInput, actorId: string) {
    const promptId = randomUUID();
    const versionId = randomUUID();
    this.validateContent(input.type, input.content);

    await withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO prompt (
           id, project_id, prompt_key, name, description, type, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          promptId,
          input.project_id,
          input.prompt_key,
          input.name,
          input.description,
          input.type,
          actorId,
        ],
      );

      await this.insertVersion(client, versionId, promptId, 1, input, actorId);
      await this.upsertLabel(client, promptId, "latest", versionId, actorId);
      await this.insertLabelHistory(
        client,
        promptId,
        "latest",
        null,
        versionId,
        "create",
        "Initial prompt version",
        actorId,
      );
    });

    return this.getPrompt(promptId);
  }

  async listPrompts(projectId: string, includeArchived = false) {
    const result = await this.pool.query<PromptRow>(
      `SELECT *
       FROM prompt
       WHERE project_id = $1
         AND ($2::boolean OR archived_at IS NULL)
       ORDER BY updated_at DESC, id`,
      [projectId, includeArchived],
    );
    return result.rows;
  }

  async getPrompt(promptId: string) {
    const prompt = await this.getPromptRow(this.pool, promptId);
    const labels = await this.listLabels(promptId);
    return { ...prompt, labels };
  }

  async updatePrompt(
    promptId: string,
    input: { name?: string | undefined; description?: string | undefined },
  ) {
    const assignments: string[] = [];
    const values: unknown[] = [];
    if (input.name !== undefined) {
      values.push(input.name);
      assignments.push(`name = $${values.length}`);
    }
    if (input.description !== undefined) {
      values.push(input.description);
      assignments.push(`description = $${values.length}`);
    }
    values.push(promptId);

    const result = await this.pool.query<PromptRow>(
      `UPDATE prompt
       SET ${assignments.join(", ")}, updated_at = now()
       WHERE id = $${values.length}
       RETURNING *`,
      values,
    );
    if (!result.rows[0]) {
      throw notFound("Prompt not found.");
    }
    return this.getPrompt(promptId);
  }

  async archivePrompt(promptId: string) {
    const result = await this.pool.query<PromptRow>(
      `UPDATE prompt
       SET archived_at = COALESCE(archived_at, now()), updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [promptId],
    );
    if (!result.rows[0]) {
      throw notFound("Prompt not found.");
    }
    return result.rows[0];
  }

  async createVersion(
    promptId: string,
    input: VersionContentInput,
    actorId: string,
  ) {
    const versionId = randomUUID();
    let version = 0;

    await withTransaction(this.pool, async (client) => {
      const prompt = await this.lockActivePrompt(client, promptId);
      this.validateContent(prompt.type, input.content);

      const versionResult = await client.query<{ next_version: number }>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM prompt_version
         WHERE prompt_id = $1`,
        [promptId],
      );
      version = versionResult.rows[0]?.next_version ?? 1;

      const currentLatest = await this.getLabelVersionForUpdate(
        client,
        promptId,
        "latest",
      );
      await this.insertVersion(client, versionId, promptId, version, input, actorId);
      await this.upsertLabel(client, promptId, "latest", versionId, actorId);
      await this.insertLabelHistory(
        client,
        promptId,
        "latest",
        currentLatest?.version_id ?? null,
        versionId,
        "move",
        `Created version ${version}`,
        actorId,
      );
      await client.query("UPDATE prompt SET updated_at = now() WHERE id = $1", [
        promptId,
      ]);
    });

    return this.getVersion(promptId, version);
  }

  async listVersions(promptId: string) {
    await this.getPromptRow(this.pool, promptId);
    const result = await this.pool.query<PromptVersionRow>(
      `SELECT *
       FROM prompt_version
       WHERE prompt_id = $1
       ORDER BY version DESC`,
      [promptId],
    );
    return result.rows;
  }

  async getVersion(promptId: string, version: number) {
    const result = await this.pool.query<PromptVersionRow>(
      `SELECT *
       FROM prompt_version
       WHERE prompt_id = $1 AND version = $2`,
      [promptId, version],
    );
    if (!result.rows[0]) {
      throw notFound("Prompt version not found.");
    }
    return result.rows[0];
  }

  async diffVersions(promptId: string, baseVersion: number, targetVersion: number) {
    const [base, target] = await Promise.all([
      this.getVersion(promptId, baseVersion),
      this.getVersion(promptId, targetVersion),
    ]);

    return {
      base_version: baseVersion,
      target_version: targetVersion,
      content: diffJson(base.content, target.content),
      model_config: diffJson(base.model_config, target.model_config),
      input_schema: diffJson(base.input_schema, target.input_schema),
      output_schema: diffJson(base.output_schema, target.output_schema),
    };
  }

  async listLabels(promptId: string) {
    const result = await this.pool.query<LabelRow>(
      `SELECT pl.label, pv.version, pl.revision, pl.updated_by, pl.updated_at
       FROM prompt_label pl
       JOIN prompt_version pv ON pv.id = pl.version_id
       WHERE pl.prompt_id = $1
       ORDER BY pl.label`,
      [promptId],
    );
    return result.rows;
  }

  async moveLabel(input: MoveLabelInput) {
    if (input.label === "latest") {
      throw badRequest("The latest label is managed automatically.");
    }

    await withTransaction(this.pool, async (client) => {
      await this.lockActivePrompt(client, input.prompt_id);

      const target = await client.query<{ id: string }>(
        `SELECT id
         FROM prompt_version
         WHERE prompt_id = $1 AND version = $2`,
        [input.prompt_id, input.version],
      );
      const targetVersionId = target.rows[0]?.id;
      if (!targetVersionId) {
        throw notFound("Target prompt version not found.");
      }

      const current = await this.getLabelVersionForUpdate(
        client,
        input.prompt_id,
        input.label,
      );
      const currentVersion = current?.version ?? null;
      if (currentVersion !== input.expected_current_version) {
        throw conflict("Label changed since it was last read.", {
          expected_current_version: input.expected_current_version,
          actual_current_version: currentVersion,
        });
      }
      if (currentVersion === input.version) {
        return;
      }

      await this.upsertLabel(
        client,
        input.prompt_id,
        input.label,
        targetVersionId,
        input.actor_id,
      );
      await this.insertLabelHistory(
        client,
        input.prompt_id,
        input.label,
        current?.version_id ?? null,
        targetVersionId,
        input.action,
        input.reason ?? null,
        input.actor_id,
      );
    });

    return this.getLabel(input.prompt_id, input.label);
  }

  async getLabel(promptId: string, label: string) {
    const result = await this.pool.query<LabelRow>(
      `SELECT pl.label, pv.version, pl.revision, pl.updated_by, pl.updated_at
       FROM prompt_label pl
       JOIN prompt_version pv ON pv.id = pl.version_id
       WHERE pl.prompt_id = $1 AND pl.label = $2`,
      [promptId, label],
    );
    if (!result.rows[0]) {
      throw notFound("Prompt label not found.");
    }
    return result.rows[0];
  }

  async listLabelHistory(promptId: string, label: string) {
    await this.getPromptRow(this.pool, promptId);
    const result = await this.pool.query(
      `SELECT
         h.id,
         h.label,
         from_version.version AS from_version,
         to_version.version AS to_version,
         h.action,
         h.reason,
         h.created_by,
         h.created_at
       FROM prompt_label_history h
       LEFT JOIN prompt_version from_version ON from_version.id = h.from_version_id
       JOIN prompt_version to_version ON to_version.id = h.to_version_id
       WHERE h.prompt_id = $1 AND h.label = $2
       ORDER BY h.created_at DESC, h.id DESC`,
      [promptId, label],
    );
    return result.rows;
  }

  private async getPromptRow(
    queryable: pg.Pool | pg.PoolClient,
    promptId: string,
  ): Promise<PromptRow> {
    const result = await queryable.query<PromptRow>(
      "SELECT * FROM prompt WHERE id = $1",
      [promptId],
    );
    if (!result.rows[0]) {
      throw notFound("Prompt not found.");
    }
    return result.rows[0];
  }

  private async lockActivePrompt(client: pg.PoolClient, promptId: string) {
    const prompt = await client.query<PromptRow>(
      "SELECT * FROM prompt WHERE id = $1 FOR UPDATE",
      [promptId],
    );
    const row = prompt.rows[0];
    if (!row) {
      throw notFound("Prompt not found.");
    }
    if (row.archived_at) {
      throw conflict("Archived prompts cannot be changed or published.");
    }
    return row;
  }

  private async insertVersion(
    client: pg.PoolClient,
    versionId: string,
    promptId: string,
    version: number,
    input: VersionContentInput,
    actorId: string,
  ) {
    await client.query(
      `INSERT INTO prompt_version (
         id, prompt_id, version, content, model_config, input_schema,
         output_schema, commit_message, created_by
       ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)`,
      [
        versionId,
        promptId,
        version,
        asJson(input.content),
        asJson(input.model_config),
        input.input_schema == null ? null : asJson(input.input_schema),
        input.output_schema == null ? null : asJson(input.output_schema),
        input.commit_message ?? null,
        actorId,
      ],
    );
  }

  private async upsertLabel(
    client: pg.PoolClient,
    promptId: string,
    label: string,
    versionId: string,
    actorId: string,
  ) {
    await client.query(
      `INSERT INTO prompt_label (
         prompt_id, label, version_id, revision, updated_by
       ) VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT (prompt_id, label)
       DO UPDATE SET
         version_id = EXCLUDED.version_id,
         revision = prompt_label.revision + 1,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [promptId, label, versionId, actorId],
    );
  }

  private async insertLabelHistory(
    client: pg.PoolClient,
    promptId: string,
    label: string,
    fromVersionId: string | null,
    toVersionId: string,
    action: "create" | "publish" | "rollback" | "move",
    reason: string | null,
    actorId: string,
  ) {
    await client.query(
      `INSERT INTO prompt_label_history (
         id, prompt_id, label, from_version_id, to_version_id,
         action, reason, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        promptId,
        label,
        fromVersionId,
        toVersionId,
        action,
        reason,
        actorId,
      ],
    );
  }

  private async getLabelVersionForUpdate(
    client: pg.PoolClient,
    promptId: string,
    label: string,
  ): Promise<{ version_id: string; version: number } | null> {
    const result = await client.query<{ version_id: string; version: number }>(
      `SELECT pl.version_id, pv.version
       FROM prompt_label pl
       JOIN prompt_version pv ON pv.id = pl.version_id
       WHERE pl.prompt_id = $1 AND pl.label = $2
       FOR UPDATE OF pl`,
      [promptId, label],
    );
    return result.rows[0] ?? null;
  }

  private validateContent(type: "text" | "chat", content: unknown) {
    if (type === "text" && typeof content !== "string") {
      throw badRequest("Text prompt content must be a string.");
    }
    if (type === "chat" && !Array.isArray(content)) {
      throw badRequest("Chat prompt content must be an array of messages.");
    }
  }
}
