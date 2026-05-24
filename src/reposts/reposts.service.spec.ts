import { RepostsService } from "@/reposts/reposts.service";

describe("RepostsService", () => {
  const readService = {
    findReposts: jest.fn(),
    findMyReposts: jest.fn(),
  };

  it("delegates public repost reads to the read collaborator", async () => {
    const service = new RepostsService({} as never, readService as never);

    await service.findReposts({ postId: 10, first: 5 }, { id: 3 } as never);

    expect(readService.findReposts).toHaveBeenCalledWith(
      { postId: 10, first: 5 },
      { id: 3 },
    );
  });

  it("delegates authenticated repost reads to the read collaborator", async () => {
    const service = new RepostsService({} as never, readService as never);

    await service.findMyReposts(3, { first: 5 });

    expect(readService.findMyReposts).toHaveBeenCalledWith(3, { first: 5 });
  });

  it("delegates repost writes to the write collaborator", async () => {
    const writeService = {
      repostPost: jest.fn().mockResolvedValue({
        repostPostId: 11,
        sourcePostId: 10,
        repostsCount: 1,
      }),
      undoRepost: jest.fn(),
      quotePost: jest.fn(),
    };
    const service = new RepostsService(
      writeService as never,
      readService as never,
    );

    await service.repostPost(3, 10);

    expect(writeService.repostPost).toHaveBeenCalledWith(3, 10);
  });

  it("delegates undo repost writes to the write collaborator", async () => {
    const writeService = {
      repostPost: jest.fn(),
      undoRepost: jest.fn().mockResolvedValue({
        message: "Repost removed successfully",
      }),
      quotePost: jest.fn(),
    };
    const service = new RepostsService(
      writeService as never,
      readService as never,
    );

    await service.undoRepost(3, 10);

    expect(writeService.undoRepost).toHaveBeenCalledWith(3, 10);
  });

  it("delegates quote writes to the write collaborator", async () => {
    const input = { sourcePostId: 10, content: "quoted content" };
    const writeService = {
      repostPost: jest.fn(),
      undoRepost: jest.fn(),
      quotePost: jest.fn().mockResolvedValue({ id: 12 }),
    };
    const service = new RepostsService(
      writeService as never,
      readService as never,
    );

    await service.quotePost(3, input);

    expect(writeService.quotePost).toHaveBeenCalledWith(3, input);
  });
});
