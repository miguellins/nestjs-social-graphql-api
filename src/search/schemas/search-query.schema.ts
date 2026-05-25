import { z } from "zod";

import { PAGINATION } from "@/common/constants/hard-cap.constants";

const ALPHANUMERIC_CHARS = /[\p{L}\p{N}]/u;
const REPEATED_CHAR_RUN = /(.)\1{19,}/u;
const FULLTEXT_OPERATOR_CHARS = /[+\-~*<>()"@]/g;
const NON_SEARCH_TOKEN_CHARS = /[^\p{L}\p{N}_]+/gu;
const USER_NON_SEARCH_TOKEN_CHARS = /[^\p{L}\p{N}_\s]+/gu;

const firstSchema = z
  .number()
  .int()
  .min(1)
  .max(PAGINATION.MAX_TAKE)
  .optional()
  .transform((first) => first ?? PAGINATION.DEFAULT_TAKE);

const baseQuerySchema = z
  .string()
  .refine((value) => !hasAsciiControlCharacter(value), {
    message: "Search query contains unsupported control characters",
  })
  .refine((value) => !REPEATED_CHAR_RUN.test(value), {
    message: "Search query contains too many repeated characters",
  })
  .refine((value) => ALPHANUMERIC_CHARS.test(value), {
    message: "Search query must include letters or numbers",
  });

/** Normalizes and validates post search service commands. */
export const searchPostsCommandSchema = z.object({
  first: firstSchema,
  q: baseQuerySchema
    .max(100)
    .transform((value) =>
      value
        .trim()
        .toLowerCase()
        .replace(FULLTEXT_OPERATOR_CHARS, " ")
        .replace(NON_SEARCH_TOKEN_CHARS, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .pipe(
      z
        .string()
        .min(2, "Search query must be at least 2 characters")
        .max(100)
        .refine((value) => ALPHANUMERIC_CHARS.test(value), {
          message: "Search query must include letters or numbers",
        }),
    ),
});

/** Normalizes and validates user search service commands. */
export const searchUsersCommandSchema = z.object({
  first: firstSchema,
  q: baseQuerySchema
    .max(50)
    .transform((value) =>
      value
        .trim()
        .replace(/^@+/, "")
        .toLowerCase()
        .replace(FULLTEXT_OPERATOR_CHARS, " ")
        .replace(USER_NON_SEARCH_TOKEN_CHARS, " ")
        .trim(),
    )
    .pipe(
      z
        .string()
        .min(2, "Search query must be at least 2 characters")
        .max(50)
        .refine((value) => ALPHANUMERIC_CHARS.test(value), {
          message: "Search query must include letters or numbers",
        }),
    ),
});

export type SearchPostsCommand = z.infer<typeof searchPostsCommandSchema>;
export type SearchUsersCommand = z.infer<typeof searchUsersCommandSchema>;

function hasAsciiControlCharacter(value: string): boolean {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}
