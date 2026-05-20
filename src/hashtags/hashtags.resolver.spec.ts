import { HashtagsResolver } from "@/hashtags/hashtags.resolver";

describe("HashtagsResolver", () => {
  it("forwards anonymous public hashtag post reads without a viewer", async () => {
    const hashtagsService = {
      postsByHashtag: jest.fn().mockResolvedValue({ items: [], pageInfo: {} }),
      searchHashtags: jest.fn(),
    };
    const resolver = new HashtagsResolver(hashtagsService as never);

    await resolver.postsByHashtag({ hashtag: "news", first: 5 }, null);

    expect(hashtagsService.postsByHashtag).toHaveBeenCalledWith(
      { hashtag: "news", first: 5 },
      undefined,
    );
  });

  it("forwards authenticated public hashtag post reads with the viewer for mute-aware filtering", async () => {
    const viewer = { id: 7 };
    const hashtagsService = {
      postsByHashtag: jest.fn().mockResolvedValue({ items: [], pageInfo: {} }),
      searchHashtags: jest.fn(),
    };
    const resolver = new HashtagsResolver(hashtagsService as never);

    await resolver.postsByHashtag({ hashtag: "news", first: 5 }, viewer);

    expect(hashtagsService.postsByHashtag).toHaveBeenCalledWith(
      { hashtag: "news", first: 5 },
      viewer,
    );
  });
});
