import { BadRequestException } from "@nestjs/common";

/** Maximum number of unique @mentions allowed in one post or comment payload. */
export const MAX_UNIQUE_MENTIONS = 10;

const MENTION_REGEX = /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{3,15})(?![a-zA-Z0-9_])/g;

/** Extracts unique canonical usernames from text using conservative mention boundaries. */
export function extractUniqueMentionUsernames(text: string): string[] {
  const usernames = new Set<string>();

  for (const match of text.matchAll(MENTION_REGEX)) {
    const username = match[2]?.toLowerCase();

    if (!username) {
      continue;
    }

    usernames.add(username);

    if (usernames.size > MAX_UNIQUE_MENTIONS) {
      throw new BadRequestException(
        `You can mention up to ${MAX_UNIQUE_MENTIONS} users per post or comment`,
      );
    }
  }

  return [...usernames];
}
