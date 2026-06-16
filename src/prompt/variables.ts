import { badRequest } from "../lib/errors.js";

const variableNamePattern = /^[A-Za-z][A-Za-z0-9_]*$/;

export function extractVariables(type: "text" | "chat", content: unknown): string[] {
  const values = contentStrings(type, content);
  const variables: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    for (const variable of extractVariablesFromString(value)) {
      if (!seen.has(variable)) {
        seen.add(variable);
        variables.push(variable);
      }
    }
  }

  return variables;
}

export function validateTemplateVariables(
  type: "text" | "chat",
  content: unknown,
): void {
  for (const value of contentStrings(type, content)) {
    validateVariableSyntax(value);
  }
}

function contentStrings(type: "text" | "chat", content: unknown): string[] {
  if (type === "text") {
    return typeof content === "string" ? [content] : [];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((message) => {
    if (!isRecord(message) || typeof message.content !== "string") {
      return [];
    }
    return [message.content];
  });
}

function extractVariablesFromString(value: string): string[] {
  const variables: string[] = [];
  const pattern = /\{\{([^{}]*)\}\}/g;
  for (const match of value.matchAll(pattern)) {
    const name = match[1] ?? "";
    if (variableNamePattern.test(name)) {
      variables.push(name);
    }
  }
  return variables;
}

function validateVariableSyntax(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    if (value.startsWith("{{", index)) {
      const end = value.indexOf("}}", index + 2);
      if (end === -1) {
        throw badRequest("Prompt variable is missing a closing }}.");
      }
      const name = value.slice(index + 2, end);
      if (!variableNamePattern.test(name)) {
        throw badRequest(
          "Prompt variables must match {{name}} with names like question or user_name1.",
        );
      }
      index = end + 1;
      continue;
    }

    if (value.startsWith("}}", index)) {
      throw badRequest("Prompt variable has a closing }} without an opening {{.");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
