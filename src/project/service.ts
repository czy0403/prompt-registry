import { randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";
import { hashToken } from "../auth.js";
import { withTransaction } from "../db/transaction.js";
import { conflict, notFound } from "../lib/errors.js";

const MAX_ACTIVE_API_TOKENS_PER_PROJECT = 20;

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type ApiTokenRow = {
  id: string;
  project_id: string;
  name: string;
  token_prefix: string;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

export class ProjectService {
  constructor(private readonly pool: pg.Pool) {}

  async createProject(input: { name: string; description: string }) {
    const result = await this.pool.query<ProjectRow>(
      `INSERT INTO project (id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [randomUUID(), input.name, input.description],
    );
    return result.rows[0];
  }

  async listProjects() {
    const result = await this.pool.query<ProjectRow>(
      "SELECT * FROM project ORDER BY updated_at DESC, id",
    );
    return result.rows;
  }

  async getProject(projectId: string) {
    const result = await this.pool.query<ProjectRow>(
      "SELECT * FROM project WHERE id = $1",
      [projectId],
    );
    if (!result.rows[0]) {
      throw notFound("Project not found.");
    }
    return result.rows[0];
  }

  async updateProject(
    projectId: string,
    input: { name?: string | undefined; description?: string | undefined },
  ) {
    await this.assertActiveProject(projectId);
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
    values.push(projectId);

    const result = await this.pool.query<ProjectRow>(
      `UPDATE project
       SET ${assignments.join(", ")}, updated_at = now()
       WHERE id = $${values.length}
       RETURNING *`,
      values,
    );
    if (!result.rows[0]) {
      throw notFound("Project not found.");
    }
    return result.rows[0];
  }

  async archiveProject(projectId: string) {
    const result = await this.pool.query<ProjectRow>(
      `UPDATE project
       SET archived_at = COALESCE(archived_at, now()), updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [projectId],
    );
    if (!result.rows[0]) {
      throw notFound("Project not found.");
    }
  }

  async permanentlyDeleteArchivedProject(projectId: string) {
    return withTransaction(this.pool, async (client) => {
      const project = await client.query<ProjectRow>(
        "SELECT * FROM project WHERE id = $1 FOR UPDATE",
        [projectId],
      );
      const row = project.rows[0];
      if (!row) {
        throw notFound("Project not found.");
      }
      if (!row.archived_at) {
        throw conflict("Only archived projects can be permanently deleted.");
      }

      await client.query(
        "SELECT set_config('prompt_registry.allow_prompt_version_delete', 'on', true)",
      );
      const history = await client.query(
        `DELETE FROM prompt_label_history
         WHERE prompt_id IN (SELECT id FROM prompt WHERE project_id = $1)`,
        [projectId],
      );
      const labels = await client.query(
        `DELETE FROM prompt_label
         WHERE prompt_id IN (SELECT id FROM prompt WHERE project_id = $1)`,
        [projectId],
      );
      const versions = await client.query(
        `DELETE FROM prompt_version
         WHERE prompt_id IN (SELECT id FROM prompt WHERE project_id = $1)`,
        [projectId],
      );
      const prompts = await client.query(
        "DELETE FROM prompt WHERE project_id = $1",
        [projectId],
      );
      const tokens = await client.query(
        "DELETE FROM project_api_token WHERE project_id = $1",
        [projectId],
      );
      await client.query("DELETE FROM project WHERE id = $1", [projectId]);

      return {
        project_id: projectId,
        name: row.name,
        deleted_prompts: prompts.rowCount ?? 0,
        deleted_versions: versions.rowCount ?? 0,
        deleted_labels: labels.rowCount ?? 0,
        deleted_label_history: history.rowCount ?? 0,
        deleted_api_tokens: tokens.rowCount ?? 0,
      };
    });
  }

  private async assertActiveProject(projectId: string) {
    const result = await this.pool.query<ProjectRow>(
      "SELECT * FROM project WHERE id = $1",
      [projectId],
    );
    const project = result.rows[0];
    if (!project) {
      throw notFound("Project not found.");
    }
    if (project.archived_at) {
      throw conflict("Archived projects cannot be changed.");
    }
  }

  async createApiToken(projectId: string, name: string) {
    const token = `prj_${randomBytes(32).toString("base64url")}`;
    const row = await withTransaction(this.pool, async (client) => {
      await this.lockActiveProject(client, projectId);

      const existing = await client.query(
        `SELECT 1
         FROM project_api_token
         WHERE project_id = $1 AND name = $2 AND revoked_at IS NULL`,
        [projectId, name],
      );
      if (existing.rows[0]) {
        throw conflict("An active project API token with this name already exists.");
      }

      const count = await client.query<{ count: string }>(
        `SELECT count(*)
         FROM project_api_token
         WHERE project_id = $1 AND revoked_at IS NULL`,
        [projectId],
      );
      if (Number(count.rows[0]?.count ?? 0) >= MAX_ACTIVE_API_TOKENS_PER_PROJECT) {
        throw conflict("Project API token limit reached.", {
          maximum_active_tokens: MAX_ACTIVE_API_TOKENS_PER_PROJECT,
        });
      }

      const result = await client.query<ApiTokenRow>(
        `INSERT INTO project_api_token (
           id, project_id, name, token_hash, token_prefix
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, project_id, name, token_prefix, last_used_at, revoked_at, created_at`,
        [randomUUID(), projectId, name, hashToken(token), token.slice(0, 12)],
      );
      return result.rows[0];
    });
    return { ...row, token };
  }

  async listApiTokens(projectId: string, includeRevoked = false) {
    await this.getProject(projectId);
    const result = await this.pool.query<ApiTokenRow>(
      `SELECT id, project_id, name, token_prefix, last_used_at, revoked_at, created_at
       FROM project_api_token
       WHERE project_id = $1
         AND ($2::boolean OR revoked_at IS NULL)
       ORDER BY created_at DESC, id`,
      [projectId, includeRevoked],
    );
    return result.rows;
  }

  async revokeApiToken(projectId: string, tokenId: string) {
    const result = await this.pool.query(
      `UPDATE project_api_token
       SET revoked_at = COALESCE(revoked_at, now())
       WHERE id = $1 AND project_id = $2
       RETURNING id`,
      [tokenId, projectId],
    );
    if (!result.rows[0]) {
      throw notFound("Project API token not found.");
    }
  }

  private async lockActiveProject(client: pg.PoolClient, projectId: string) {
    const result = await client.query<ProjectRow>(
      "SELECT * FROM project WHERE id = $1 FOR UPDATE",
      [projectId],
    );
    const project = result.rows[0];
    if (!project) {
      throw notFound("Project not found.");
    }
    if (project.archived_at) {
      throw conflict("Archived projects cannot be changed.");
    }
  }
}
