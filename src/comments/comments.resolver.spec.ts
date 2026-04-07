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

    await resolver.commentsByPost({
      postId: 10,
      first: 5,
      after: "cursor",
      orderBy: ChronologicalOrder.OLDEST,
    });

    expect(commentsService.findCommentsByPost).toHaveBeenCalledWith({
      postId: 10,
      first: 5,
      after: "cursor",
      orderBy: ChronologicalOrder.OLDEST,
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
});
