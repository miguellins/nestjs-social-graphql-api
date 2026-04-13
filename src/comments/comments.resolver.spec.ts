import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";

import { CommentsResolver } from "./comments.resolver";

describe("CommentsResolver", () => {
  it("forwards cursor pagination args to the service for commentsByPost", async () => {
    const commentsService = {
      findCommentsByPost: jest.fn().mockResolvedValue({
        items: [],
        pageInfo: { endCursor: null, hasNextPage: false },
      }),
    };

    const resolver = new CommentsResolver(commentsService as never);

    await resolver.commentsByPost(
      {
        postId: 10,
        first: 5,
        after: "cursor",
        orderBy: ChronologicalOrder.OLDEST,
      },
      { id: 4, role: "USER" },
    );

    expect(commentsService.findCommentsByPost).toHaveBeenCalledWith({
      postId: 10,
      first: 5,
      after: "cursor",
      orderBy: ChronologicalOrder.OLDEST,
      viewerId: 4,
    });
  });

  it("forwards updateComment args to the service", async () => {
    const commentsService = {
      updateComment: jest.fn().mockResolvedValue({ id: 1 }),
    };

    const resolver = new CommentsResolver(commentsService as never);

    await resolver.updateComment(10, { content: "updated" }, { id: 7 });

    expect(commentsService.updateComment).toHaveBeenCalledWith(
      10,
      { content: "updated" },
      7,
    );
  });

  it("forwards removeCommentByModerator args to the service", async () => {
    const commentsService = {
      removeCommentByModerator: jest.fn().mockResolvedValue({
        message: "Comment removed successfully",
      }),
    };

    const resolver = new CommentsResolver(commentsService as never);

    await resolver.removeCommentByModerator(
      { commentId: 10, reason: "abuse", reportId: 77 },
      { id: 7, role: "MODERATOR" },
    );

    expect(commentsService.removeCommentByModerator).toHaveBeenCalledWith(
      { commentId: 10, reason: "abuse", reportId: 77 },
      { id: 7, role: "MODERATOR" },
    );
  });
});
