import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";

import { BookmarksResolver } from "./bookmarks.resolver";

describe("BookmarksResolver", () => {
  it("forwards myBookmarks args to the service", async () => {
    const bookmarksService = {
      findMyBookmarks: jest.fn().mockResolvedValue({
        items: [],
        pageInfo: { endCursor: null, hasNextPage: false },
      }),
    };

    const resolver = new BookmarksResolver(bookmarksService as never);

    await resolver.myBookmarks(
      {
        first: 5,
        after: "cursor",
        orderBy: ChronologicalOrder.OLDEST,
      },
      { id: 7 },
    );

    expect(bookmarksService.findMyBookmarks).toHaveBeenCalledWith(7, {
      first: 5,
      after: "cursor",
      orderBy: ChronologicalOrder.OLDEST,
    });
  });

  it("forwards bookmarkPost to the service", async () => {
    const bookmarksService = {
      bookmarkPost: jest.fn().mockResolvedValue({ id: 1 }),
    };

    const resolver = new BookmarksResolver(bookmarksService as never);

    await resolver.bookmarkPost(10, { id: 3 });

    expect(bookmarksService.bookmarkPost).toHaveBeenCalledWith(3, 10);
  });

  it("forwards removeBookmark to the service", async () => {
    const bookmarksService = {
      removeBookmark: jest.fn().mockResolvedValue({
        message: "Bookmark removed successfully",
      }),
    };

    const resolver = new BookmarksResolver(bookmarksService as never);

    await resolver.removeBookmark(10, { id: 3 });

    expect(bookmarksService.removeBookmark).toHaveBeenCalledWith(3, 10);
  });
});
