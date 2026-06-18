import { z } from "zod";
import {
  descriptionSchema,
  displayNameSchema,
  tokenNameSchema,
} from "../lib/input-validation.js";

export const createProjectSchema = z.object({
  name: displayNameSchema,
  description: descriptionSchema.default(""),
});

export const updateProjectSchema = z
  .object({
    name: displayNameSchema.optional(),
    description: descriptionSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const createApiTokenSchema = z.object({
  name: tokenNameSchema,
});

export const listApiTokenQuerySchema = z.object({
  include_revoked: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
}).strict();
