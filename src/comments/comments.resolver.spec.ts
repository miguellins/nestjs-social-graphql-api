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
});
