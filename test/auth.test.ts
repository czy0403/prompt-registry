import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FastifyRequest } from "fastify";
import { assertAdmin, bearerToken, hashToken } from "../src/auth.js";
import { AppError } from "../src/lib/errors.js";

function requestWithAuthorization(authorization?: string): FastifyRequest {
  return { headers: { authorization } } as FastifyRequest;
}

describe("auth helpers", () => {
  it("extracts Bearer tokens", () => {
    assert.equal(
      bearerToken(requestWithAuthorization("Bearer secret-token")),
      "secret-token",
    );
  });

  it("rejects missing or malformed Bearer tokens", () => {
    assert.throws(() => bearerToken(requestWithAuthorization()), AppError);
    assert.throws(
      () => bearerToken(requestWithAuthorization("Basic secret-token")),
      AppError,
    );
    assert.throws(
      () => bearerToken(requestWithAuthorization("Bearer token with spaces")),
      AppError,
    );
  });

  it("hashes tokens consistently and validates administrator tokens", () => {
    assert.equal(hashToken("secret"), hashToken("secret"));
    assert.notEqual(hashToken("secret"), hashToken("other"));

    assert.doesNotThrow(() => {
      assertAdmin(requestWithAuthorization("Bearer secret"), "secret");
    });
    assert.throws(
      () => assertAdmin(requestWithAuthorization("Bearer other"), "secret"),
      AppError,
    );
  });
});
