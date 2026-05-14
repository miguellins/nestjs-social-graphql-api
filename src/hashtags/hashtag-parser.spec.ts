import { BadRequestException } from "@nestjs/common";

import {
  extractUniqueHashtagSlugs,
  MAX_UNIQUE_HASHTAGS,
  normalizeHashtagSearchPrefix,
  normalizeHashtagSlug,
} from "@/hashtags/hashtag-parser";

describe("hashtag-parser", () => {
  it("extracts lowercase unique ASCII slugs with punctuation boundaries", () => {
    expect(extractUniqueHashtagSlugs("Try #NestJS, #GraphQL! #nestjs")).toEqual(
      ["nestjs", "graphql"],
    );
  });

  it("allows numeric hashtags", () => {
    expect(extractUniqueHashtagSlugs("Release #123 is live")).toEqual(["123"]);
  });

  it("ignores hashes embedded inside words", () => {
    expect(extractUniqueHashtagSlugs("not#aTag but yes #tag")).toEqual(["tag"]);
  });

  it("rejects too-short hashtag tokens", () => {
    expect(() => extractUniqueHashtagSlugs("#a")).toThrow(BadRequestException);
  });

  it("rejects reserved hashtags", () => {
    expect(() => extractUniqueHashtagSlugs("#admin")).toThrow(
      BadRequestException,
    );
  });

  it("rejects more than the unique hashtag cap", () => {
    const content = Array.from(
      { length: MAX_UNIQUE_HASHTAGS + 1 },
      (_, index) => `#tag${index}`,
    ).join(" ");

    expect(() => extractUniqueHashtagSlugs(content)).toThrow(
      BadRequestException,
    );
  });

  it("normalizes args with or without a leading hash", () => {
    expect(normalizeHashtagSlug(" #GraphQL ")).toBe("graphql");
    expect(normalizeHashtagSlug("GraphQL")).toBe("graphql");
  });

  it("normalizes one-character search prefixes", () => {
    expect(normalizeHashtagSearchPrefix(" #G ")).toBe("g");
  });
});
