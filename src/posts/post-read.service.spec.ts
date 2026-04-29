import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { CommentsReadService } from "@/comments/comments-read.service";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { MediaReadProjectionService } from "@/media/media-read-projection.service";
import { R2StorageService } from "@/media/storage/r2-storage.service";
import { PrismaService } from "@/prisma/prisma.service";
import { PostReadService } from "@/posts/post-read.service";
import { SafePostDetailSelect } from "@/posts/dto/safe-post-detail.dto";
import { MutesService } from "@/mutes/mutes.service";

describe("PostReadService", () => {
  let service: PostReadService;
  let moduleRef: TestingModule;

  const prismaMock = {
    post: {
      findFirst: jest.fn(),
    },
    userBlock: {
      findMany: jest.fn(),
    },
  };

  const commentsReadServiceMock = {
    listThreadedCommentsForPost: jest.fn(),
  };

  const r2StorageMock = {
    getPublicUrl: jest.fn(),
  };

  const mutesServiceMock = {
    getMutedUserIds: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.userBlock.findMany.mockResolvedValue([]);
    mutesServiceMock.getMutedUserIds.mockResolvedValue([]);
    commentsReadServiceMock.listThreadedCommentsForPost.mockResolvedValue([
      {
        id: 30,
        content: "Threaded comment",
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
        authorId: 5,
        postId: 11,
        parentCommentId: null,
        author: {
          id: 5,
          name: "Alice",
          username: "alice",
        },
        repliesCount: 0,
        replies: [],
      },
    ]);
    r2StorageMock.getPublicUrl.mockImplementation(
      (objectKey: string) => `https://media.example.com/${objectKey}`,
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        PostReadService,
        MediaReadProjectionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CommentsReadService, useValue: commentsReadServiceMock },
        { provide: MutesService, useValue: mutesServiceMock },
        { provide: R2StorageService, useValue: r2StorageMock },
      ],
    }).compile();

    service = moduleRef.get(PostReadService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it("loads post detail without fetching comments from the main Prisma query", async () => {
    prismaMock.post.findFirst.mockResolvedValue({
      id: 11,
      title: "Title",
      content: "Content",
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      editedAt: null,
      likesCount: 1,
      commentsCount: 1,
      viewsCount: 2,
      author: {
        id: 7,
        name: "Miguel",
        username: "miguel",
      },
      likes: [],
      mediaAttachments: [],
    });

    const result = await service.getPostDetail(11, 7);

    expect(prismaMock.post.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            id: 11,
            removedAt: null,
            author: {
              accountState: {
                not: "DEACTIVATED",
              },
            },
          },
          {
            OR: [
              {
                authorId: 7,
              },
              {
                author: {
                  privacySetting: "PUBLIC",
                },
              },
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
      select: {
        ...SafePostDetailSelect,
        likes: {
          take: Math.min(
            PAGINATION.DEFAULT_TAKE_LIKES,
            PAGINATION.MAX_TAKE_LIKES,
          ),
          orderBy: {
            createdAt: "desc",
          },
          select: SafePostDetailSelect.likes.select,
        },
      },
    });

    expect(result.comments).toEqual([
      {
        id: 30,
        content: "Threaded comment",
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
        authorId: 5,
        postId: 11,
        parentCommentId: null,
        author: {
          id: 5,
          name: "Alice",
          username: "alice",
        },
        repliesCount: 0,
        replies: [],
      },
    ]);
    expect(
      commentsReadServiceMock.listThreadedCommentsForPost,
    ).toHaveBeenCalledWith(
      11,
      7,
      Math.min(PAGINATION.DEFAULT_TAKE, PAGINATION.MAX_TAKE),
    );
  });

  it("throws NotFound when the post cannot be read", async () => {
    prismaMock.post.findFirst.mockResolvedValue(null);

    await expect(service.getPostDetail(11, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
