import { RepostsResolver } from "@/reposts/reposts.resolver";

describe("RepostsResolver", () => {
  it("forwards reposts args and optional viewer to the service", async () => {
    const repostsService = {
      findReposts: jest.fn().mockResolvedValue({
        items: [],
        pageInfo: { endCursor: null, hasNextPage: false },
      }),
    };
    const resolver = new RepostsResolver(repostsService as never);

    await resolver.reposts({ postId: 10, first: 5 }, { id: 3 } as never);

    expect(repostsService.findReposts).toHaveBeenCalledWith(
      { postId: 10, first: 5 },
      { id: 3 },
    );
  });

  it("forwards myReposts args to the service", async () => {
    const repostsService = {
      findMyReposts: jest.fn().mockResolvedValue({
        items: [],
        pageInfo: { endCursor: null, hasNextPage: false },
      }),
    };
    const resolver = new RepostsResolver(repostsService as never);

    await resolver.myReposts({ first: 5 }, { id: 3 });

    expect(repostsService.findMyReposts).toHaveBeenCalledWith(3, { first: 5 });
  });
  it("forwards repostPost to the service", async () => {
    const repostsService = {
      repostPost: jest.fn().mockResolvedValue({
        repostPostId: 11,
        sourcePostId: 10,
        repostsCount: 1,
      }),
    };
    const resolver = new RepostsResolver(repostsService as never);

    await resolver.repostPost(10, { id: 3 });

    expect(repostsService.repostPost).toHaveBeenCalledWith(3, 10);
  });

  it("forwards undoRepost to the service", async () => {
    const repostsService = {
      undoRepost: jest.fn().mockResolvedValue({
        message: "Repost removed successfully",
      }),
    };
    const resolver = new RepostsResolver(repostsService as never);

    await resolver.undoRepost(10, { id: 3 });

    expect(repostsService.undoRepost).toHaveBeenCalledWith(3, 10);
  });

  it("forwards quotePost to the service", async () => {
    const input = { sourcePostId: 10, content: "quoted content" };
    const repostsService = {
      quotePost: jest.fn().mockResolvedValue({ id: 12 }),
    };
    const resolver = new RepostsResolver(repostsService as never);

    await resolver.quotePost(input, { id: 3 });

    expect(repostsService.quotePost).toHaveBeenCalledWith(3, input);
  });
});
