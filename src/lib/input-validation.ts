import { z } from "zod";

const namePattern = /^[\p{L}\p{N}][\p{L}\p{N} ._:/()%-]*$/u;
const tokenNamePattern = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const disallowedControlChars = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const hasUnsupportedControlChars = (value: string) =>
  disallowedControlChars.test(value);

const withoutControlChars = (value: string) =>
  !disallowedControlChars.test(value);

const controlCharacterMessage = (label: string) => ({
  message: `${label} contains unsupported control characters.`,
});

export const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(namePattern, {
    message:
      "Use letters or numbers plus spaces, dot, underscore, slash, hyphen, colon, parentheses, or percent.",
  });

export const tokenNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(tokenNamePattern, {
    message:
      "Use letters, numbers, dot, underscore, slash, or hyphen; start with a letter or number.",
  });

export const descriptionSchema = z
  .string()
  .trim()
  .max(10_000)
  .refine(
    withoutControlChars,
    controlCharacterMessage("Description"),
  );

export const optionalNoteSchema = z
  .string()
  .trim()
  .max(2000)
  .refine(withoutControlChars, controlCharacterMessage("Note"))
  .nullable()
  .optional()
  .transform((value) => value || null);
