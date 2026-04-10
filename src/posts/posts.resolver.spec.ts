import { PostsResolver } from "./posts.resolver";

describe("PostsResolver", () => {
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
