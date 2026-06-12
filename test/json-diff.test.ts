import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffJson } from "../src/lib/json-diff.js";

describe("diffJson", () => {
  it("reports nested additions, removals, and changes", () => {
    assert.deepEqual(
      diffJson(
        { messages: [{ role: "system", content: "old" }], removed: true },
        { messages: [{ role: "system", content: "new" }], added: true },
      ),
      [
      { path: "$.added", kind: "added", after: true },
      {
        path: "$.messages[0].content",
        kind: "changed",
        before: "old",
        after: "new",
      },
      { path: "$.removed", kind: "removed", before: true },
      ],
    );
  });
});
