import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const promptKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/);
export const labelSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const versionContentSchema = z.object({
  content: z.unknown().refine((value) => value !== undefined, {
    message: "Content is required.",
  }),
  model_config: jsonObjectSchema.default({}),
  input_schema: jsonObjectSchema.nullable().optional(),
  output_schema: jsonObjectSchema.nullable().optional(),
  commit_message: z.string().max(2000).nullable().optional(),
});

export const createPromptSchema = z
  .object({
    prompt_key: promptKeySchema,
    name: z.string().min(1).max(128),
    description: z.string().max(10_000).default(""),
    type: z.enum(["text", "chat"]),
  })
  .extend(versionContentSchema.shape)
  .superRefine((value, context) => {
    if (value.type === "text" && typeof value.content !== "string") {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: "Text prompt content must be a string.",
      });
    }
    if (value.type === "chat" && !Array.isArray(value.content)) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: "Chat prompt content must be an array of messages.",
      });
    }
  });

export const updatePromptSchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    description: z.string().max(10_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const createVersionSchema = versionContentSchema;

export const moveLabelSchema = z.object({
  version: z.number().int().positive(),
  expected_current_version: z.number().int().positive().nullable(),
  reason: z.string().max(2000).nullable().optional(),
});

export const listPromptQuerySchema = z.object({
  include_archived: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const diffQuerySchema = z.object({
  base_version: z.coerce.number().int().positive(),
});
