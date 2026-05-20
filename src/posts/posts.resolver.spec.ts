import { PostsResolver } from "./posts.resolver";
import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";

describe("PostsResolver", () => {
  it("forwards anonymous public post reads without a viewer", async () => {
    const postsService = {
      findPosts: jest.fn().mockResolvedValue({ items: [], pageInfo: {} }),
      getPost: jest.fn().mockResolvedValue({ id: 10 }),
      findPostsByUsername: jest
        .fn()
        .mockResolvedValue({ items: [], pageInfo: {} }),
    };
    const resolver = new PostsResolver(postsService as never);

    await resolver.posts({ first: 5 }, null);
    await resolver.postById(10, null);
    await resolver.postsByUsername({ username: "author", first: 5 }, null);

    expect(postsService.findPosts).toHaveBeenCalledWith(
      { first: 5 },
      undefined,
    );
    expect(postsService.getPost).toHaveBeenCalledWith(10, undefined);
    expect(postsService.findPostsByUsername).toHaveBeenCalledWith(
      "author",
      { username: "author", first: 5 },
      undefined,
    );
  });

  it("forwards authenticated public post reads with the viewer for mute-aware filtering", async () => {
    const viewer = { id: 7 };
    const postsService = {
      findPosts: jest.fn().mockResolvedValue({ items: [], pageInfo: {} }),
      getPost: jest.fn().mockResolvedValue({ id: 10 }),
      findPostsByUsername: jest
        .fn()
        .mockResolvedValue({ items: [], pageInfo: {} }),
    };
    const resolver = new PostsResolver(postsService as never);

    await resolver.posts({ first: 5 }, viewer);
    await resolver.postById(10, viewer);
    await resolver.postsByUsername({ username: "author", first: 5 }, viewer);

    expect(postsService.findPosts).toHaveBeenCalledWith({ first: 5 }, viewer);
    expect(postsService.getPost).toHaveBeenCalledWith(10, viewer);
    expect(postsService.findPostsByUsername).toHaveBeenCalledWith(
      "author",
      { username: "author", first: 5 },
      viewer,
    );
  });

  it("forwards homeFeed args to the service", async () => {
    const postsService = {
      homeFeed: jest.fn().mockResolvedValue({
        items: [],
        pageInfo: {
          endCursor: null,
          hasNextPage: false,
        },
      }),
      removePostByModerator: jest.fn(),
    };

    const resolver = new PostsResolver(postsService as never);

    await resolver.homeFeed(
      { id: 7 },
      {
        first: 5,
        after: "cursor",
        orderBy: ChronologicalOrder.OLDEST,
      },
    );

    expect(postsService.homeFeed).toHaveBeenCalledWith(7, {
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
    const resolver = new PostsResolver(postsService as never);

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
