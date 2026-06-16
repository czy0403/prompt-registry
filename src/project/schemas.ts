import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(10_000).default(""),
});

export const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    description: z.string().max(10_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const createApiTokenSchema = z.object({
  name: z.string().min(1).max(128),
});

export const listApiTokenQuerySchema = z.object({
  include_revoked: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
}).strict();
