import { PostsResolver } from "./posts.resolver";
import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";

describe("PostsResolver", () => {
  it("forwards homeFeed args to the feed read service", async () => {
    const postsService = {
      removePostByModerator: jest.fn(),
    };
    const feedReadService = {
      getHomeFeed: jest.fn().mockResolvedValue({
        items: [],
        pageInfo: {
          endCursor: null,
          hasNextPage: false,
        },
      }),
    };

    const resolver = new PostsResolver(
      postsService as never,
      feedReadService as never,
    );

    await resolver.homeFeed(
      { id: 7 },
      {
        first: 5,
        after: "cursor",
        orderBy: ChronologicalOrder.OLDEST,
      },
    );

    expect(feedReadService.getHomeFeed).toHaveBeenCalledWith(7, {
      first: 5,
      after: "cursor",
      orderBy: ChronologicalOrder.OLDEST,
    });
  });

  it("forwards removePostByModerator args to the service", async () => {
    const postsService = {
      removePostByModerator: jest.fn().mockResolvedValue({
        message: "Post removed successfully",
      }),
    };
    const feedReadService = {
      getHomeFeed: jest.fn(),
    };

    const resolver = new PostsResolver(
      postsService as never,
      feedReadService as never,
    );

    await resolver.removePostByModerator(
      { postId: 10, reason: "spam", reportId: 99 },
      { id: 3, role: "MODERATOR" },
    );

    expect(postsService.removePostByModerator).toHaveBeenCalledWith(
      { postId: 10, reason: "spam", reportId: 99 },
      { id: 3, role: "MODERATOR" },
    );
  });
});
