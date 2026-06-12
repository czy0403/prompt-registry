export type JsonDiffEntry = {
  path: string;
  kind: "added" | "removed" | "changed";
  before?: unknown;
  after?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function diffJson(
  before: unknown,
  after: unknown,
  path = "$",
): JsonDiffEntry[] {
  if (Object.is(before, after)) {
    return [];
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const result: JsonDiffEntry[] = [];
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      const childPath = `${path}[${index}]`;
      if (index >= before.length) {
        result.push({ path: childPath, kind: "added", after: after[index] });
      } else if (index >= after.length) {
        result.push({ path: childPath, kind: "removed", before: before[index] });
      } else {
        result.push(...diffJson(before[index], after[index], childPath));
      }
    }
    return result;
  }

  if (isRecord(before) && isRecord(after)) {
    const result: JsonDiffEntry[] = [];
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      const childPath = `${path}.${key}`;
      if (!(key in before)) {
        result.push({ path: childPath, kind: "added", after: after[key] });
      } else if (!(key in after)) {
        result.push({ path: childPath, kind: "removed", before: before[key] });
      } else {
        result.push(...diffJson(before[key], after[key], childPath));
      }
    }
    return result;
  }

  return [{ path, kind: "changed", before, after }];
}
