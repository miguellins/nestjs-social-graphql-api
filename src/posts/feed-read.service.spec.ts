import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";

import { encodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";

import { FeedReadService } from "@/posts/feed-read.service";
import { HomeFeedItemSelect } from "@/posts/dto/home-feed-item.dto";
import { PostReadService } from "@/posts/post-read.service";
import { MutesService } from "@/mutes/mutes.service";

import { MediaReadProjectionService } from "@/media/media-read-projection.service";
import { R2StorageService } from "@/media/storage/r2-storage.service";

import { OutboxService } from "@/outbox/outbox.service";
import { HOME_FEED_USER_BOOTSTRAP_EVENT } from "@/outbox/events/home-feed-user-bootstrap.event";

import { MetricsRegistryService } from "@/metrics/metrics-registry.service";

import { PrismaService } from "@/prisma/prisma.service";
import { AccountState } from "@/users/enums/account-state.enum";

describe("FeedReadService", () => {
  let service: FeedReadService;
  let moduleRef: TestingModule;

  const prismaMock = {
    post: {
      findMany: jest.fn(),
    },
    homeFeedEntry: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const postReadServiceMock = {
    getBlockedAuthorIds: jest.fn(),
  };

  const mutesServiceMock = {
    getMutedUserIds: jest.fn(),
  };

  const r2StorageMock = {
    getPublicUrl: jest.fn(),
  };

  const outboxServiceMock = {
    enqueue: jest.fn(),
  };
  const metricsRegistryMock = {
    incrementHomeFeedProjectionCleanupEnqueue: jest.fn(),
    incrementHomeFeedShadowCompare: jest.fn(),
    incrementHomeFeedShadowCompareMismatch: jest.fn(),
  };

  const makeConfigServiceMock = (overrides?: Record<string, unknown>) => ({
    get: jest.fn((key: string) => overrides?.[key]),
  });

  const makeFeedRow = (id: number) => ({
    id,
    title: `Title ${id}`,
    content: `Content ${id}`,
    createdAt: new Date(`2026-04-0${id}T00:00:00.000Z`),
    likesCount: id + 10,
    commentsCount: id + 20,
    author: {
      id: id + 100,
      name: `User ${id}`,
      username: `user${id}`,
    },
    likes: id % 2 === 0 ? [{ id: 1 }] : [],
    bookmarks: id % 2 === 1 ? [{ id: 2 }] : [],
    mediaAttachments: [
      {
        id: id + 500,
        sortOrder: 0,
        createdAt: new Date(`2026-04-0${id}T01:00:00.000Z`),
        media: {
          id: id + 700,
          kind: "IMAGE",
          type: "IMAGE",
          status: "READY",
          objectKey: `feed/${id}.jpg`,
          mimeType: "image/jpeg",
          bytes: 1024,
          width: 100,
          height: 100,
          durationMs: null,
          createdAt: new Date(`2026-04-0${id}T01:00:00.000Z`),
          updatedAt: new Date(`2026-04-0${id}T01:00:00.000Z`),
          attachedAt: new Date(`2026-04-0${id}T01:00:00.000Z`),
        },
      },
    ],
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.user.findUnique.mockResolvedValue({
      accountState: AccountState.ACTIVE,
    });
    postReadServiceMock.getBlockedAuthorIds.mockResolvedValue([]);
    mutesServiceMock.getMutedUserIds.mockResolvedValue([]);
    r2StorageMock.getPublicUrl.mockImplementation(
      (objectKey: string) => `https://media.example.com/${objectKey}`,
    );
    outboxServiceMock.enqueue.mockResolvedValue({ id: 1 });

    moduleRef = await Test.createTestingModule({
      providers: [
        FeedReadService,
        MediaReadProjectionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PostReadService, useValue: postReadServiceMock },
        { provide: MutesService, useValue: mutesServiceMock },
        { provide: R2StorageService, useValue: r2StorageMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        {
          provide: ConfigService,
          useValue: makeConfigServiceMock({
            FEED_PROJECTION_READ_ENABLED: false,
            FEED_PROJECTION_SHADOW_COMPARE_ENABLED: false,
            FEED_PROJECTION_SHADOW_COMPARE_DEBUG_ONLY: true,
            FEED_PROJECTION_SHADOW_COMPARE_SAMPLE_RATE: 0,
            FEED_PROJECTION_ENQUEUE_ENABLED: false,
            FEED_PROJECTION_READ_COHORT_ENABLED: false,
            FEED_PROJECTION_READ_COHORT_SAMPLE_RATE: 0,
            FEED_PROJECTION_READ_REQUIRE_POPULATED: true,
          }),
        },
      ],
    }).compile();

    service = moduleRef.get(FeedReadService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it("returns the authenticated user's home feed with viewer-relative state and media URLs", async () => {
    prismaMock.post.findMany.mockResolvedValue([
      makeFeedRow(3),
      makeFeedRow(2),
    ]);

    const result = await service.getHomeFeed(7, {
      first: 1,
    });

    expect(prismaMock.post.findMany).toHaveBeenCalledWith({
      take: 2,
      where: {
        AND: [
          { removedAt: null },
          {
            author: {
              accountState: AccountState.ACTIVE,
            },
          },
          {
            OR: [
              { authorId: 7 },
              {
                author: {
                  followers: {
                    some: {
                      followerId: 7,
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        ...HomeFeedItemSelect,
        likes: {
          ...HomeFeedItemSelect.likes,
          where: {
            userId: 7,
          },
        },
        bookmarks: {
          ...HomeFeedItemSelect.bookmarks,
          where: {
            userId: 7,
          },
        },
      },
    });

    expect(result.items).toEqual([
      {
        id: 3,
        title: "Title 3",
        content: "Content 3",
        createdAt: new Date("2026-04-03T00:00:00.000Z"),
        likesCount: 13,
        commentsCount: 23,
        viewerHasLiked: false,
        viewerHasBookmarked: true,
        author: {
          id: 103,
          name: "User 3",
          username: "user3",
        },
        mediaAttachments: [
          expect.objectContaining({
            id: 503,
            sortOrder: 0,
          }),
        ],
      },
    ]);
    expect(result.items[0]?.mediaAttachments?.[0]?.media.publicUrl).toBe(
      "https://media.example.com/feed/3.jpg",
    );
    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.pageInfo.endCursor).toEqual(expect.any(String));
  });

  it("reads home feed from projection when enabled", async () => {
    await moduleRef?.close();

    const configServiceMock = makeConfigServiceMock({
      FEED_PROJECTION_READ_ENABLED: true,
      FEED_PROJECTION_SHADOW_COMPARE_ENABLED: false,
      FEED_PROJECTION_SHADOW_COMPARE_DEBUG_ONLY: true,
      FEED_PROJECTION_SHADOW_COMPARE_SAMPLE_RATE: 0,
      FEED_PROJECTION_ENQUEUE_ENABLED: false,
      FEED_PROJECTION_READ_COHORT_ENABLED: false,
      FEED_PROJECTION_READ_COHORT_SAMPLE_RATE: 0,
      FEED_PROJECTION_READ_REQUIRE_POPULATED: true,
    });

    moduleRef = await Test.createTestingModule({
      providers: [
        FeedReadService,
        MediaReadProjectionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PostReadService, useValue: postReadServiceMock },
        { provide: MutesService, useValue: mutesServiceMock },
        { provide: R2StorageService, useValue: r2StorageMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = moduleRef.get(FeedReadService);

    prismaMock.homeFeedEntry.count.mockResolvedValue(1);
    prismaMock.homeFeedEntry.findMany.mockResolvedValue([
      { postId: 3, postCreatedAt: new Date("2026-04-03T00:00:00.000Z") },
      { postId: 2, postCreatedAt: new Date("2026-04-02T00:00:00.000Z") },
    ]);
    prismaMock.post.findMany.mockResolvedValue([
      makeFeedRow(3),
      makeFeedRow(2),
    ]);

    const result = await service.getHomeFeed(7, { first: 1 });

    expect(prismaMock.homeFeedEntry.findMany).toHaveBeenCalledWith({
      take: 2,
      where: { AND: [{ userId: 7 }, { hiddenAt: null }] },
      orderBy: [{ postCreatedAt: "desc" }, { postId: "desc" }],
      select: { postId: true, postCreatedAt: true },
    });
    expect(prismaMock.post.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { id: { in: [3] } },
          { removedAt: null },
          {
            author: {
              accountState: AccountState.ACTIVE,
            },
          },
        ],
      },
      select: {
        ...HomeFeedItemSelect,
        likes: {
          ...HomeFeedItemSelect.likes,
          where: {
            userId: 7,
          },
        },
        bookmarks: {
          ...HomeFeedItemSelect.bookmarks,
          where: {
            userId: 7,
          },
        },
      },
    });
    expect(result.items[0]?.id).toBe(3);
  });

  it("records skipped cleanup enqueue when projection rows do not hydrate and enqueueing is disabled", async () => {
    await moduleRef?.close();

    const configServiceMock = makeConfigServiceMock({
      FEED_PROJECTION_READ_ENABLED: true,
      FEED_PROJECTION_SHADOW_COMPARE_ENABLED: false,
      FEED_PROJECTION_SHADOW_COMPARE_DEBUG_ONLY: true,
      FEED_PROJECTION_SHADOW_COMPARE_SAMPLE_RATE: 0,
      FEED_PROJECTION_ENQUEUE_ENABLED: false,
      FEED_PROJECTION_READ_COHORT_ENABLED: false,
      FEED_PROJECTION_READ_COHORT_SAMPLE_RATE: 0,
      FEED_PROJECTION_READ_REQUIRE_POPULATED: true,
    });

    moduleRef = await Test.createTestingModule({
      providers: [
        FeedReadService,
        MediaReadProjectionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PostReadService, useValue: postReadServiceMock },
        { provide: MutesService, useValue: mutesServiceMock },
        { provide: R2StorageService, useValue: r2StorageMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = moduleRef.get(FeedReadService);

    prismaMock.homeFeedEntry.count.mockResolvedValue(1);
    prismaMock.homeFeedEntry.findMany.mockResolvedValue([
      { postId: 3, postCreatedAt: new Date("2026-04-03T00:00:00.000Z") },
    ]);
    prismaMock.post.findMany.mockResolvedValue([]);

    await service.getHomeFeed(7, { first: 1 });

    expect(
      metricsRegistryMock.incrementHomeFeedProjectionCleanupEnqueue,
    ).toHaveBeenCalledWith("skipped_disabled");
  });

  it("records cleanup enqueue success when missing projection rows are enqueued", async () => {
    await moduleRef?.close();

    const configServiceMock = makeConfigServiceMock({
      FEED_PROJECTION_READ_ENABLED: true,
      FEED_PROJECTION_SHADOW_COMPARE_ENABLED: false,
      FEED_PROJECTION_SHADOW_COMPARE_DEBUG_ONLY: true,
      FEED_PROJECTION_SHADOW_COMPARE_SAMPLE_RATE: 0,
      FEED_PROJECTION_ENQUEUE_ENABLED: true,
      FEED_PROJECTION_READ_COHORT_ENABLED: false,
      FEED_PROJECTION_READ_COHORT_SAMPLE_RATE: 0,
      FEED_PROJECTION_READ_REQUIRE_POPULATED: true,
    });

    moduleRef = await Test.createTestingModule({
      providers: [
        FeedReadService,
        MediaReadProjectionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PostReadService, useValue: postReadServiceMock },
        { provide: MutesService, useValue: mutesServiceMock },
        { provide: R2StorageService, useValue: r2StorageMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = moduleRef.get(FeedReadService);

    prismaMock.homeFeedEntry.count.mockResolvedValue(1);
    prismaMock.homeFeedEntry.findMany.mockResolvedValue([
      { postId: 3, postCreatedAt: new Date("2026-04-03T00:00:00.000Z") },
    ]);
    prismaMock.post.findMany.mockResolvedValue([]);
    outboxServiceMock.enqueue.mockResolvedValue({ id: 10 });

    await service.getHomeFeed(7, { first: 1 });
    await waitForBestEffortWork();

    expect(
      metricsRegistryMock.incrementHomeFeedProjectionCleanupEnqueue,
    ).toHaveBeenCalledWith("enqueued");
  });

  it("records cleanup enqueue failure when missing projection cleanup enqueue fails", async () => {
    await moduleRef?.close();

    const configServiceMock = makeConfigServiceMock({
      FEED_PROJECTION_READ_ENABLED: true,
      FEED_PROJECTION_SHADOW_COMPARE_ENABLED: false,
      FEED_PROJECTION_SHADOW_COMPARE_DEBUG_ONLY: true,
      FEED_PROJECTION_SHADOW_COMPARE_SAMPLE_RATE: 0,
      FEED_PROJECTION_ENQUEUE_ENABLED: true,
      FEED_PROJECTION_READ_COHORT_ENABLED: false,
      FEED_PROJECTION_READ_COHORT_SAMPLE_RATE: 0,
      FEED_PROJECTION_READ_REQUIRE_POPULATED: true,
    });

    moduleRef = await Test.createTestingModule({
      providers: [
        FeedReadService,
        MediaReadProjectionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PostReadService, useValue: postReadServiceMock },
        { provide: MutesService, useValue: mutesServiceMock },
        { provide: R2StorageService, useValue: r2StorageMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = moduleRef.get(FeedReadService);

    prismaMock.homeFeedEntry.count.mockResolvedValue(1);
    prismaMock.homeFeedEntry.findMany.mockResolvedValue([
      { postId: 3, postCreatedAt: new Date("2026-04-03T00:00:00.000Z") },
    ]);
    prismaMock.post.findMany.mockResolvedValue([]);
    outboxServiceMock.enqueue.mockRejectedValue(new Error("db down"));

    await service.getHomeFeed(7, { first: 1 });
    await waitForBestEffortWork();

    expect(
      metricsRegistryMock.incrementHomeFeedProjectionCleanupEnqueue,
    ).toHaveBeenCalledWith("failed");
  });

  it("records shadow compare totals and mismatches when shadow compare runs", async () => {
    await moduleRef?.close();

    const configServiceMock = makeConfigServiceMock({
      FEED_PROJECTION_READ_ENABLED: true,
      FEED_PROJECTION_SHADOW_COMPARE_ENABLED: true,
      FEED_PROJECTION_SHADOW_COMPARE_DEBUG_ONLY: false,
      FEED_PROJECTION_SHADOW_COMPARE_SAMPLE_RATE: 1,
      FEED_PROJECTION_ENQUEUE_ENABLED: false,
      FEED_PROJECTION_READ_COHORT_ENABLED: false,
      FEED_PROJECTION_READ_COHORT_SAMPLE_RATE: 0,
      FEED_PROJECTION_READ_REQUIRE_POPULATED: true,
    });

    moduleRef = await Test.createTestingModule({
      providers: [
        FeedReadService,
        MediaReadProjectionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PostReadService, useValue: postReadServiceMock },
        { provide: MutesService, useValue: mutesServiceMock },
        { provide: R2StorageService, useValue: r2StorageMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = moduleRef.get(FeedReadService);

    prismaMock.homeFeedEntry.count.mockResolvedValue(1);
    prismaMock.homeFeedEntry.findMany.mockResolvedValue([
      { postId: 3, postCreatedAt: new Date("2026-04-03T00:00:00.000Z") },
    ]);
    prismaMock.post.findMany
      .mockResolvedValueOnce([makeFeedRow(3)])
      .mockResolvedValueOnce([makeFeedRow(2)]);

    await service.getHomeFeed(7, { first: 1 });
    await waitForBestEffortWork();

    expect(
      metricsRegistryMock.incrementHomeFeedShadowCompare,
    ).toHaveBeenCalled();
    expect(
      metricsRegistryMock.incrementHomeFeedShadowCompareMismatch,
    ).toHaveBeenCalled();
  });

  it("falls back to legacy and enqueues bootstrap when cohort read requires populated projection", async () => {
    await moduleRef?.close();

    const configServiceMock = makeConfigServiceMock({
      FEED_PROJECTION_READ_ENABLED: false,
      FEED_PROJECTION_READ_COHORT_ENABLED: true,
      FEED_PROJECTION_READ_COHORT_SAMPLE_RATE: 1,
      FEED_PROJECTION_READ_REQUIRE_POPULATED: true,
      FEED_PROJECTION_ENQUEUE_ENABLED: true,
      FEED_PROJECTION_SHADOW_COMPARE_ENABLED: false,
      FEED_PROJECTION_SHADOW_COMPARE_DEBUG_ONLY: true,
      FEED_PROJECTION_SHADOW_COMPARE_SAMPLE_RATE: 0,
    });

    moduleRef = await Test.createTestingModule({
      providers: [
        FeedReadService,
        MediaReadProjectionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PostReadService, useValue: postReadServiceMock },
        { provide: MutesService, useValue: mutesServiceMock },
        { provide: R2StorageService, useValue: r2StorageMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = moduleRef.get(FeedReadService);

    prismaMock.homeFeedEntry.count.mockResolvedValue(0);
    prismaMock.post.findMany.mockResolvedValue([
      makeFeedRow(3),
      makeFeedRow(2),
    ]);

    await service.getHomeFeed(7, { first: 1 });

    // Cohort enabled, but projection empty → should serve legacy and enqueue bootstrap.
    expect(prismaMock.post.findMany).toHaveBeenCalled();
    expect(outboxServiceMock.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: HOME_FEED_USER_BOOTSTRAP_EVENT,
        aggregateType: "user",
        aggregateId: 7,
        payload: { userId: 7 },
      }),
    );
  });

  it("adds cursor and block filters and clamps take", async () => {
    prismaMock.post.findMany.mockResolvedValue([]);
    postReadServiceMock.getBlockedAuthorIds.mockResolvedValue([11, 12]);
    const after = encodeChronoCursor({
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      id: 999,
    });

    await service.getHomeFeed(7, {
      first: PAGINATION.MAX_TAKE + 20,
      after,
      orderBy: ChronologicalOrder.OLDEST,
    });

    expect(prismaMock.post.findMany).toHaveBeenCalledWith({
      take: PAGINATION.MAX_TAKE + 1,
      where: {
        AND: [
          { removedAt: null },
          {
            author: {
              accountState: AccountState.ACTIVE,
            },
          },
          {
            OR: [
              { authorId: 7 },
              {
                author: {
                  followers: {
                    some: {
                      followerId: 7,
                    },
                  },
                },
              },
            ],
          },
          {
            authorId: {
              notIn: [11, 12],
            },
          },
          {
            OR: [
              { createdAt: { gt: new Date("2026-04-10T00:00:00.000Z") } },
              {
                createdAt: new Date("2026-04-10T00:00:00.000Z"),
                id: { gt: 999 },
              },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        ...HomeFeedItemSelect,
        likes: {
          ...HomeFeedItemSelect.likes,
          where: {
            userId: 7,
          },
        },
        bookmarks: {
          ...HomeFeedItemSelect.bookmarks,
          where: {
            userId: 7,
          },
        },
      },
    });
  });

  it("returns an empty connection when no visible posts are found", async () => {
    prismaMock.post.findMany.mockResolvedValue([]);

    await expect(service.getHomeFeed(7)).resolves.toEqual({
      items: [],
      pageInfo: {
        endCursor: null,
        hasNextPage: false,
      },
    });
  });

  it("throws ForbiddenException for suspended users", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      accountState: AccountState.SUSPENDED,
    });

    await expect(service.getHomeFeed(7)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(prismaMock.post.findMany).not.toHaveBeenCalled();
  });

  it("throws NotFoundException for deactivated users", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      accountState: AccountState.DEACTIVATED,
    });

    await expect(service.getHomeFeed(7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

function waitForBestEffortWork(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
