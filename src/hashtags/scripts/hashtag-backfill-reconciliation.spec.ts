import { AccountState, UserPrivacySetting } from "@prisma/client";

import {
  HashtagBackfillReconciliationRunner,
  parseHashtagBackfillArgs,
} from "@/hashtags/scripts/hashtag-backfill-reconciliation";

describe("HashtagBackfillReconciliationRunner", () => {
  const tx = {};
  const prismaMock = {
    hashtag: {
      updateMany: jest.fn(),
    },
    post: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const hashtagsServiceMock = {
    isPubliclyCountablePost: jest.fn(),
    replacePostHashtags: jest.fn(),
  };
  const cacheHelperMock = {
    bumpVersion: jest.fn(),
  };
  let logSpy: jest.SpyInstance;
  let runner: HashtagBackfillReconciliationRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    runner = new HashtagBackfillReconciliationRunner(
      prismaMock as never,
      hashtagsServiceMock as never,
      cacheHelperMock as never,
    );
    prismaMock.$transaction.mockImplementation(
      async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback(tx),
    );
    hashtagsServiceMock.isPubliclyCountablePost.mockReturnValue(true);
    hashtagsServiceMock.replacePostHashtags.mockResolvedValue({
      changed: true,
      publicCountChanged: true,
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("parses safe dry-run defaults and explicit apply mode", () => {
    expect(
      parseHashtagBackfillArgs([
        "--mode",
        "repair-joins",
        "--after-id=10",
        "--limit",
        "25",
        "--chunk-size",
        "5",
        "--log-format",
        "json",
      ]),
    ).toEqual({
      afterId: 10,
      chunkSize: 5,
      dryRun: true,
      limit: 25,
      logFormat: "json",
      mode: "repair-joins",
    });

    expect(
      parseHashtagBackfillArgs(["--mode", "repair-counts", "--apply"]).dryRun,
    ).toBe(false);
  });

  it("observes join drift without writing or bumping cache versions", async () => {
    prismaMock.post.findMany
      .mockResolvedValueOnce([
        {
          id: 11,
          content: "#graphql #nestjs",
          createdAt: new Date("2026-05-13T10:00:00.000Z"),
          removedAt: null,
          author: {
            accountState: AccountState.ACTIVE,
            privacySetting: UserPrivacySetting.PUBLIC,
          },
          hashtags: [
            {
              postCreatedAt: new Date("2026-05-13T10:00:00.000Z"),
              hashtag: { slug: "graphql" },
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]);

    await runner.run({
      afterId: 0,
      chunkSize: 10,
      dryRun: true,
      logFormat: "json",
      mode: "observe-joins",
    });

    expect(hashtagsServiceMock.replacePostHashtags).not.toHaveBeenCalled();
    expect(cacheHelperMock.bumpVersion).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"join_drift_observed"'),
    );
  });

  it("skips invalid historical post content without mutating joins", async () => {
    prismaMock.post.findMany
      .mockResolvedValueOnce([
        {
          id: 12,
          content: "#admin",
          createdAt: new Date("2026-05-13T10:00:00.000Z"),
          removedAt: null,
          author: {
            accountState: AccountState.ACTIVE,
            privacySetting: UserPrivacySetting.PUBLIC,
          },
          hashtags: [],
        },
      ])
      .mockResolvedValueOnce([]);

    await runner.run({
      afterId: 0,
      chunkSize: 10,
      dryRun: false,
      logFormat: "json",
      mode: "repair-joins",
    });

    expect(hashtagsServiceMock.replacePostHashtags).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"classification":"skipped_invalid_content"'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"reason":"reserved"'),
    );
  });

  it("repairs join drift through the shared hashtag service and bumps list versions", async () => {
    const createdAt = new Date("2026-05-13T10:00:00.000Z");

    prismaMock.post.findMany
      .mockResolvedValueOnce([
        {
          id: 13,
          content: "#graphql",
          createdAt,
          removedAt: null,
          author: {
            accountState: AccountState.ACTIVE,
            privacySetting: UserPrivacySetting.PUBLIC,
          },
          hashtags: [],
        },
      ])
      .mockResolvedValueOnce([]);

    await runner.run({
      afterId: 0,
      chunkSize: 10,
      dryRun: false,
      logFormat: "json",
      mode: "repair-joins",
    });

    expect(hashtagsServiceMock.replacePostHashtags).toHaveBeenCalledWith({
      content: "#graphql",
      postCreatedAt: createdAt,
      postId: 13,
      publiclyCountable: true,
      tx,
    });
    expect(cacheHelperMock.bumpVersion).toHaveBeenCalledWith("v:hashtags:list");
    expect(cacheHelperMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
    expect(cacheHelperMock.bumpVersion).toHaveBeenCalledTimes(4);
  });

  it("repairs count drift from aggregate truth and bumps list versions", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          actualPostsCount: 3,
          hashtagId: 5,
          slug: "graphql",
          storedPostsCount: 1,
        },
      ])
      .mockResolvedValueOnce([]);
    prismaMock.hashtag.updateMany.mockResolvedValue({ count: 1 });

    await runner.run({
      afterId: 0,
      chunkSize: 10,
      dryRun: false,
      logFormat: "json",
      mode: "repair-counts",
    });

    expect(prismaMock.hashtag.updateMany).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { postsCount: 3 },
    });
    expect(cacheHelperMock.bumpVersion).toHaveBeenCalledWith("v:hashtags:list");
    expect(cacheHelperMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
    expect(cacheHelperMock.bumpVersion).toHaveBeenCalledTimes(4);
  });
});
