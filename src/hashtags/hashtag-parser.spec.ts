import { BadRequestException } from "@nestjs/common";

import {
  classifyHashtagContentError,
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

  it("classifies invalid legacy content reasons", () => {
    expect(
      classifyHashtagContentError(
        new BadRequestException("This hashtag is reserved"),
      ),
    ).toBe("reserved");
    expect(
      classifyHashtagContentError(
        new BadRequestException("Hashtags may contain only ASCII letters"),
      ),
    ).toBe("charset");
    expect(
      classifyHashtagContentError(
        new BadRequestException("Hashtags must be at most 32 characters long"),
      ),
    ).toBe("length");
    expect(
      classifyHashtagContentError(
        new BadRequestException("You can add up to 10 hashtags per post"),
      ),
    ).toBe("too_many_unique");
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
