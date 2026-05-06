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
});
