import { ConfigService } from "@nestjs/config";

import { HomeFeedProjectionService } from "@/posts/home-feed-projection.service";

import { PrismaService } from "@/prisma/prisma.service";

describe("HomeFeedProjectionService", () => {
  const prismaMock = {
    follow: {
      findMany: jest.fn(),
    },
    homeFeedEntry: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      updateMany: jest.fn(),
    },
    mute: {
      findMany: jest.fn(),
    },
    post: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    userBlock: {
      findMany: jest.fn(),
    },
  };
  const configServiceMock = {
    get: jest.fn(),
  };

  let service: HomeFeedProjectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    configServiceMock.get.mockImplementation((key: string) => {
      if (key === "MUTES_ENABLED") return false;
      return undefined;
    });
    service = new HomeFeedProjectionService(
      prismaMock as unknown as PrismaService,
      configServiceMock as unknown as ConfigService,
    );
  });

  it("categorizes reconciliation order mismatches with minimal diff context", async () => {
    prismaMock.homeFeedEntry.groupBy.mockResolvedValue([{ userId: 1 }]);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.userBlock.findMany.mockResolvedValue([]);
    prismaMock.homeFeedEntry.findMany.mockResolvedValue([
      { postId: 1 },
      { postId: 2 },
    ]);
    prismaMock.post.findMany
      .mockResolvedValueOnce([{ id: 2 }, { id: 1 }])
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    const result = await service.reconcileSampledUsers({
      pageSize: 100,
      sampleSize: 25,
    });

    expect(result.usersChecked).toBe(1);
    expect(result.matched).toBe(0);
    expect(result.mismatches).toEqual([
      expect.objectContaining({
        category: "order",
        firstDivergentIndex: 0,
        legacyIds: [2, 1],
        projectionIds: [1, 2],
        userId: 1,
      }),
    ]);
  });

  it("restores soft-hidden projected rows during follow backfill", async () => {
    prismaMock.post.findMany.mockResolvedValue([
      {
        id: 11,
        authorId: 2,
        createdAt: new Date("2026-04-11T00:00:00.000Z"),
      },
    ]);
    prismaMock.homeFeedEntry.createMany.mockResolvedValue({ count: 0 });
    prismaMock.homeFeedEntry.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.backfillAfterFollow({
      followerId: 1,
      followingId: 2,
      now: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ candidates: 1, inserted: 0, restored: 1 });
    expect(prismaMock.homeFeedEntry.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 1,
        postId: { in: [11] },
        hiddenAt: { not: null },
      },
      data: {
        hiddenAt: null,
      },
    });
  });

  it("restores soft-hidden projected rows during user bootstrap", async () => {
    prismaMock.follow.findMany.mockResolvedValue([{ followingId: 2 }]);
    prismaMock.post.findMany.mockResolvedValue([
      {
        id: 12,
        authorId: 2,
        createdAt: new Date("2026-04-12T00:00:00.000Z"),
      },
    ]);
    prismaMock.homeFeedEntry.createMany.mockResolvedValue({ count: 0 });
    prismaMock.homeFeedEntry.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.bootstrapUserHomeFeed({ userId: 1 });

    expect(result).toEqual({ candidates: 1, inserted: 0, restored: 1 });
    expect(prismaMock.homeFeedEntry.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 1,
        postId: { in: [12] },
        hiddenAt: { not: null },
      },
      data: {
        hiddenAt: null,
      },
    });
  });

  it("uses configured post limits for backfill and bootstrap work", async () => {
    configServiceMock.get.mockImplementation((key: string) => {
      if (key === "FEED_PROJECTION_BACKFILL_POST_LIMIT") return 50;
      if (key === "FEED_PROJECTION_BOOTSTRAP_POST_LIMIT") return 75;
      if (key === "MUTES_ENABLED") return false;
      return undefined;
    });
    service = new HomeFeedProjectionService(
      prismaMock as unknown as PrismaService,
      configServiceMock as unknown as ConfigService,
    );
    prismaMock.post.findMany.mockResolvedValue([]);
    prismaMock.follow.findMany.mockResolvedValue([{ followingId: 2 }]);

    await service.backfillAfterFollow({
      followerId: 1,
      followingId: 2,
      now: new Date("2026-05-01T00:00:00.000Z"),
    });
    await service.bootstrapUserHomeFeed({ userId: 1 });

    expect(prismaMock.post.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 50 }),
    );
    expect(prismaMock.post.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ take: 75 }),
    );
  });
});
