import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";

import { CommentsResolver } from "./comments.resolver";

describe("CommentsResolver", () => {
  it("forwards orderBy to the service for commentsByPost", async () => {
    const commentsService = {
      findCommentsByPost: jest.fn().mockResolvedValue([]),
    };

    const resolver = new CommentsResolver(commentsService as never);

    await resolver.commentsByPost({
      postId: 10,
      take: 5,
      orderBy: ChronologicalOrder.OLDEST,
    });

    expect(commentsService.findCommentsByPost).toHaveBeenCalledWith({
      postId: 10,
      take: 5,
      orderBy: ChronologicalOrder.OLDEST,
    });
  });

  it("forwards updateComment args to the service", async () => {
    const commentsService = {
      updateComment: jest.fn().mockResolvedValue({ id: 1 }),
    };

    const resolver = new CommentsResolver(commentsService as never);

    await resolver.updateComment(
      {
        commentId: 10,
        input: { content: "updated" },
      },
      { id: 7 },
    );

    expect(commentsService.updateComment).toHaveBeenCalledWith(
      10,
      { content: "updated" },
      7,
    );
  });
});
