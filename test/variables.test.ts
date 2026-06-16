import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../src/lib/errors.js";
import {
  extractVariables,
  validateTemplateVariables,
} from "../src/prompt/variables.js";

describe("prompt variables", () => {
  it("extracts unique variables in first-seen order", () => {
    assert.deepEqual(
      extractVariables(
        "text",
        "Hello {{name}}, your plan is {{plan}}. Hi again {{name}}.",
      ),
      ["name", "plan"],
    );
    assert.deepEqual(
      extractVariables("chat", [
        { role: "system", content: "Use {{tone}} tone." },
        { role: "user", content: "{{question}} from {{tone}}" },
      ]),
      ["tone", "question"],
    );
  });

  it("ignores non-string chat message content", () => {
    assert.deepEqual(
      extractVariables("chat", [
        { role: "system", content: "Use {{tone}} tone." },
        { role: "user", content: [{ text: "{{ignored}}" }] },
      ]),
      ["tone"],
    );
  });

  it("rejects malformed template variables", () => {
    assert.throws(
      () => validateTemplateVariables("text", "Hello {{question"),
      AppError,
    );
    assert.throws(
      () => validateTemplateVariables("text", "Hello question}}"),
      AppError,
    );
    assert.throws(
      () => validateTemplateVariables("text", "Hello {{user-name}}"),
      AppError,
    );
  });
});
