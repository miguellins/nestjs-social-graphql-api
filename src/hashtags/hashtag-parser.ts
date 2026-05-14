import { BadRequestException } from "@nestjs/common";

/** Maximum number of unique hashtags allowed in one post payload. */
export const MAX_UNIQUE_HASHTAGS = 10;

/** Minimum canonical hashtag slug length. */
export const MIN_HASHTAG_LENGTH = 2;

/** Maximum canonical hashtag slug length. */
export const MAX_HASHTAG_LENGTH = 32;

const HASHTAG_REGEX = /(^|[^a-zA-Z0-9_])#([a-zA-Z0-9_]+)(?![a-zA-Z0-9_])/g;

const RESERVED_HASHTAG_SLUGS = new Set([
  "admin",
  "administrator",
  "help",
  "moderator",
  "security",
  "staff",
  "support",
]);

/** Extracts unique canonical hashtag slugs from text using conservative boundaries. */
export function extractUniqueHashtagSlugs(text: string): string[] {
  const slugs = new Set<string>();

  for (const match of text.matchAll(HASHTAG_REGEX)) {
    const slug = match[2]?.toLowerCase();

    if (!slug) {
      continue;
    }

    validateHashtagSlug(slug);

    slugs.add(slug);

    if (slugs.size > MAX_UNIQUE_HASHTAGS) {
      throw new BadRequestException(
        `You can add up to ${MAX_UNIQUE_HASHTAGS} hashtags per post`,
      );
    }
  }

  return [...slugs];
}

/** Normalizes a hashtag argument or token into the canonical lowercase slug. */
export function normalizeHashtagSlug(value: string): string {
  const slug = value.trim().replace(/^#+/, "").toLowerCase();
  validateHashtagSlug(slug);
  return slug;
}

/** Normalizes a hashtag search prefix without requiring a full hashtag length. */
export function normalizeHashtagSearchPrefix(value: string): string {
  const prefix = value.trim().replace(/^#+/, "").toLowerCase();

  if (prefix.length === 0) {
    throw new BadRequestException("Hashtag search query is required");
  }

  if (prefix.length > MAX_HASHTAG_LENGTH) {
    throw new BadRequestException(
      `Hashtag search query must be at most ${MAX_HASHTAG_LENGTH} characters long`,
    );
  }

  if (!/^[a-z0-9_]+$/.test(prefix)) {
    throw new BadRequestException(
      "Hashtag search query may contain only ASCII letters, numbers, and underscores",
    );
  }

  return prefix;
}

/** Validates one canonical hashtag slug for length, charset, and reserved words. */
export function validateHashtagSlug(slug: string): void {
  if (slug.length < MIN_HASHTAG_LENGTH) {
    throw new BadRequestException(
      `Hashtags must be at least ${MIN_HASHTAG_LENGTH} characters long`,
    );
  }

  if (slug.length > MAX_HASHTAG_LENGTH) {
    throw new BadRequestException(
      `Hashtags must be at most ${MAX_HASHTAG_LENGTH} characters long`,
    );
  }

  if (!/^[a-z0-9_]+$/.test(slug)) {
    throw new BadRequestException(
      "Hashtags may contain only ASCII letters, numbers, and underscores",
    );
  }

  if (RESERVED_HASHTAG_SLUGS.has(slug)) {
    throw new BadRequestException("This hashtag is reserved");
  }
}
