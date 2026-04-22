import { BadRequestException } from "@nestjs/common";

import {
  MAX_UNIQUE_MENTIONS,
  extractUniqueMentionUsernames,
} from "@/mentions/mention-parser";

describe("mention-parser", () => {
  it("extracts unique canonical usernames with conservative boundaries", () => {
    expect(
      extractUniqueMentionUsernames(
        "Hello @John, meet (@mary_1). Email test@example.com should not count.",
      ),
    ).toEqual(["john", "mary_1"]);
  });

  it("deduplicates repeated mentions", () => {
    expect(
      extractUniqueMentionUsernames("@John hi again @john and @JOHN"),
    ).toEqual(["john"]);
  });

  it("throws when the unique mention cap is exceeded", () => {
    const content = Array.from(
      { length: MAX_UNIQUE_MENTIONS + 1 },
      (_, index) => `@user${index + 100}`,
    ).join(" ");

    expect(() => extractUniqueMentionUsernames(content)).toThrow(
      BadRequestException,
    );
  });
});
