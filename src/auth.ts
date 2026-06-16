import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type pg from "pg";
import { unauthorized } from "./lib/errors.js";

export type AdminAuthConfig = {
  adminApiToken: string;
  adminActorId: string;
};

export function bearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match?.[1]) {
    throw unauthorized("A valid Bearer token is required.");
  }
  return match[1];
}

export function assertAdmin(request: FastifyRequest, expectedToken: string): void {
  const actual = Buffer.from(hashToken(bearerToken(request)), "hex");
  const expected = Buffer.from(hashToken(expectedToken), "hex");
  if (!timingSafeEqual(actual, expected)) {
    throw unauthorized("A valid administrator token is required.");
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function authenticateProjectToken(
  pool: pg.Pool,
  request: FastifyRequest,
): Promise<string> {
  const result = await pool.query<{ id: string; project_id: string }>(
    `SELECT pat.id, pat.project_id
     FROM project_api_token pat
     WHERE pat.token_hash = $1
       AND pat.revoked_at IS NULL`,
    [hashToken(bearerToken(request))],
  );
  const token = result.rows[0];
  if (!token) {
    throw unauthorized("A valid project API token is required.");
  }

  await pool.query(
    "UPDATE project_api_token SET last_used_at = now() WHERE id = $1",
    [token.id],
  );
  return token.project_id;
}
