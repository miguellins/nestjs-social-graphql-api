import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Test, TestingModule } from "@nestjs/testing";
import sharp from "sharp";

import {
  MediaKind,
  Prisma,
  MediaStatus,
  MediaType,
  MediaVisibility,
  StorageProvider,
} from "@prisma/client";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { encodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { MediaReadProjectionService } from "@/media/media-read-projection.service";
import { MediaService } from "@/media/media.service";
import { MediaValidationService } from "@/media/media-validation.service";
import { MAX_IMAGE_BYTES } from "@/media/schemas/media-write.schema";
import { R2StorageService } from "@/media/storage/r2-storage.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("MediaService", () => {
  let service: MediaService;
  let moduleRef: TestingModule;
  type MyMediaFindManyCall = {
    where: Record<string, unknown>;
    take: number;
    orderBy: Record<string, unknown> | Array<Record<string, unknown>>;
    select?: Record<string, unknown>;
  };

  type MediaCreateArgs = {
    data: Record<string, unknown>;
    select: {
      id: true;
    };
  };

  type MediaUpdateArgs = {
    where: {
      id: number;
    };
    data: Record<string, unknown>;
    select: Record<string, unknown>;
  };

  type MediaFindManyArgs = {
    where: {
      ownerId: number;
    };
    take: number;
    orderBy: {
      createdAt: "asc" | "desc";
    };
    select: Record<string, unknown>;
  };

  type CreatePresignedPutUrlArgs = {
    objectKey: string;
    contentType: string;
  };

  type CreatePresignedGetUrlArgs = [objectKey: string];

  const onePixelPngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0i8AAAAASUVORK5CYII=",
    "base64",
  );
  const validMp4HeaderBuffer = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  ]);
  const invalidVideoBuffer = Buffer.from("not-a-video");

  const prismaMock: {
    post: {
      findUnique: jest.Mock;
    };
    media: {
      create: jest.Mock<Promise<unknown>, [MediaCreateArgs]>;
      findUnique: jest.Mock;
      update: jest.Mock<Promise<unknown>, [MediaUpdateArgs]>;
      findMany: jest.Mock<Promise<unknown>, [MediaFindManyArgs]>;
      delete: jest.Mock;
    };
    postMedia: {
      create: jest.Mock;
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  } = {
    post: {
      findUnique: jest.fn(),
    },
    media: {
      create: jest.fn<Promise<unknown>, [MediaCreateArgs]>(),
      findUnique: jest.fn(),
      update: jest.fn<Promise<unknown>, [MediaUpdateArgs]>(),
      findMany: jest.fn<Promise<unknown>, [MediaFindManyArgs]>(),
      delete: jest.fn(),
    },
    postMedia: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const cacheMock: {
    del: jest.Mock;
  } = {
    del: jest.fn(),
  };

  const configMock: {
    get: jest.Mock;
  } = {
    get: jest.fn(),
  };

  const r2StorageMock: {
    createPresignedPutUrl: jest.Mock<
      Promise<string>,
      [CreatePresignedPutUrlArgs]
    >;
    createPresignedGetUrl: jest.Mock<
      Promise<string>,
      CreatePresignedGetUrlArgs
    >;
    headObject: jest.Mock;
    getPublicUrl: jest.Mock;
    getBucket: jest.Mock;
    getPresignedUrlTtlSeconds: jest.Mock<number, []>;
    getObjectBuffer: jest.Mock;
  } = {
    createPresignedPutUrl: jest.fn<
      Promise<string>,
      [CreatePresignedPutUrlArgs]
    >(),
    createPresignedGetUrl: jest.fn<
      Promise<string>,
      CreatePresignedGetUrlArgs
    >(),
    headObject: jest.fn(),
    getPublicUrl: jest.fn(),
    getBucket: jest.fn(),
    getPresignedUrlTtlSeconds: jest.fn<number, []>(),
    getObjectBuffer: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    configMock.get.mockImplementation((key: string) => {
      switch (key) {
        case "MEDIA_IMAGE_MAX_BYTES":
          return MAX_IMAGE_BYTES;
        case "MEDIA_VIDEO_MAX_BYTES":
          return 100 * 1024 * 1024;
        default:
          return undefined;
      }
    });
    r2StorageMock.getBucket.mockReturnValue("app-photos-videos");
    r2StorageMock.getPresignedUrlTtlSeconds.mockReturnValue(1800);
    r2StorageMock.getPublicUrl.mockImplementation(
      (objectKey: string) => `https://media.example.com/${objectKey}`,
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        MediaReadProjectionService,
        MediaService,
        MediaValidationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
        { provide: R2StorageService, useValue: r2StorageMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = moduleRef.get(MediaService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("requestPostMediaUpload", () => {
    it("creates a pending media row and returns upload instructions", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 11, authorId: 7 });
      prismaMock.media.findMany.mockResolvedValue([]);
      prismaMock.media.create.mockResolvedValue({
        id: 91,
        kind: MediaKind.POST_IMAGE,
        type: MediaType.IMAGE,
        status: MediaStatus.PENDING_UPLOAD,
        objectKey: "posts/11/media/file/original.jpg",
        mimeType: "image/jpeg",
        bytes: null,
        width: null,
        height: null,
        durationMs: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        attachedAt: null,
      });
      r2StorageMock.createPresignedPutUrl.mockResolvedValue(
        "https://upload.example.com",
      );

      const result = await service.requestPostMediaUpload(
        {
          postId: 11,
          mimeType: "IMAGE/JPEG",
          originalFileName: " photo.jpg ",
        },
        7,
      );

      const createCall = prismaMock.media.create.mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
        select: Record<string, unknown>;
      };

      expect(createCall.data).toMatchObject({
        kind: MediaKind.POST_IMAGE,
        type: MediaType.IMAGE,
        status: MediaStatus.PENDING_UPLOAD,
        visibility: MediaVisibility.PUBLIC,
        storageProvider: StorageProvider.R2,
        bucket: "app-photos-videos",
        mimeType: "image/jpeg",
        originalFileName: "photo.jpg",
        owner: { connect: { id: 7 } },
      });
      expect(createCall.select).toEqual({
        id: true,
      });

      const presignedCall = r2StorageMock.createPresignedPutUrl.mock
        .calls[0]?.[0] as {
        objectKey: string;
        contentType: string;
      };

      expect(presignedCall.objectKey).toMatch(/^posts\/11\/media\//);
      expect(presignedCall.contentType).toBe("image/jpeg");
      expect(result.mediaId).toBe(91);
      expect(result.uploadUrl).toBe("https://upload.example.com");
      expect(result.publicUrl).toMatch(
        /^https:\/\/media\.example\.com\/posts\/11\/media\//,
      );
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it("aligns the pending media expiry with the presigned upload URL ttl", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 11, authorId: 7 });
      prismaMock.media.findMany.mockResolvedValue([]);
      prismaMock.media.create.mockResolvedValue({
        id: 91,
      });
      r2StorageMock.createPresignedPutUrl.mockResolvedValue(
        "https://upload.example.com",
      );
      r2StorageMock.getPresignedUrlTtlSeconds.mockReturnValue(90);

      const before = Date.now();

      const result = await service.requestPostMediaUpload(
        {
          postId: 11,
          mimeType: "image/png",
          originalFileName: "image.png",
        },
        7,
      );

      const after = Date.now();

      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + 90_000,
      );
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(after + 90_000);
    });

    it("throws ForbiddenException when the current user does not own the post", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 11, authorId: 99 });

      await expect(
        service.requestPostMediaUpload(
          {
            postId: 11,
            mimeType: "image/jpeg",
          },
          7,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prismaMock.media.create).not.toHaveBeenCalled();
    });

    it("throws BadRequestException for unsupported MIME type", async () => {
      await expect(
        service.requestPostMediaUpload(
          {
            postId: 11,
            mimeType: "application/pdf",
          },
          7,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.post.findUnique).not.toHaveBeenCalled();
    });

    it("counts attached READY media and active pending reservations when requesting uploads", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 11, authorId: 7 });
      prismaMock.media.findMany.mockResolvedValue([]);
      prismaMock.media.create.mockResolvedValue({ id: 91 });
      r2StorageMock.createPresignedPutUrl.mockResolvedValue(
        "https://upload.example.com",
      );

      await service.requestPostMediaUpload(
        {
          postId: 11,
          mimeType: "image/png",
          originalFileName: "image.png",
        },
        7,
      );

      const findManyCall = prismaMock.media.findMany.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      const where = findManyCall.where as {
        OR: Array<Record<string, unknown>>;
      };

      expect(where.OR[0]).toEqual({
        postAttachments: {
          some: {
            postId: 11,
          },
        },
        status: MediaStatus.READY,
      });
      expect(where.OR[1]).toMatchObject({
        objectKey: {
          startsWith: "posts/11/media/",
        },
        status: MediaStatus.PENDING_UPLOAD,
      });
      expect(
        (
          where.OR[1] as {
            expiresAt: {
              gt: Date;
            };
          }
        ).expiresAt.gt,
      ).toBeInstanceOf(Date);
    });

    it("releases abandoned reservation slots after expiry on the same post", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 11, authorId: 7 });
      prismaMock.media.findMany
        .mockResolvedValueOnce([
          {
            id: 1,
            type: MediaType.IMAGE,
            status: MediaStatus.READY,
          },
          {
            id: 2,
            type: MediaType.IMAGE,
            status: MediaStatus.READY,
          },
          {
            id: 3,
            type: MediaType.IMAGE,
            status: MediaStatus.READY,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 1,
            type: MediaType.IMAGE,
            status: MediaStatus.READY,
          },
          {
            id: 2,
            type: MediaType.IMAGE,
            status: MediaStatus.READY,
          },
          {
            id: 3,
            type: MediaType.IMAGE,
            status: MediaStatus.READY,
          },
          {
            id: 91,
            type: MediaType.IMAGE,
            status: MediaStatus.PENDING_UPLOAD,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 1,
            type: MediaType.IMAGE,
            status: MediaStatus.READY,
          },
          {
            id: 2,
            type: MediaType.IMAGE,
            status: MediaStatus.READY,
          },
          {
            id: 3,
            type: MediaType.IMAGE,
            status: MediaStatus.READY,
          },
        ]);
      prismaMock.media.create
        .mockResolvedValueOnce({ id: 91 })
        .mockResolvedValueOnce({ id: 92 });
      r2StorageMock.createPresignedPutUrl
        .mockResolvedValueOnce("https://upload.example.com/first")
        .mockResolvedValueOnce("https://upload.example.com/second");
      r2StorageMock.getPresignedUrlTtlSeconds.mockReturnValue(60);

      const firstReservation = await service.requestPostMediaUpload(
        {
          postId: 11,
          mimeType: "image/png",
          originalFileName: "image-1.png",
        },
        7,
      );

      await expect(
        service.requestPostMediaUpload(
          {
            postId: 11,
            mimeType: "image/png",
            originalFileName: "image-2.png",
          },
          7,
        ),
      ).rejects.toThrow("A post can have at most 4 media attachments");

      const secondReservation = await service.requestPostMediaUpload(
        {
          postId: 11,
          mimeType: "image/png",
          originalFileName: "image-3.png",
        },
        7,
      );

      expect(firstReservation.mediaId).toBe(91);
      expect(secondReservation.mediaId).toBe(92);
      expect(prismaMock.media.create).toHaveBeenCalledTimes(2);
      expect(r2StorageMock.createPresignedPutUrl).toHaveBeenCalledTimes(2);
    });
  });

  describe("completePostMediaUpload", () => {
    it("throws BadRequestException when the uploaded object is missing", async () => {
      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 7,
        status: MediaStatus.PENDING_UPLOAD,
        type: MediaType.IMAGE,
        objectKey: "posts/11/media/file/original.jpg",
        mimeType: "image/jpeg",
        bytes: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      r2StorageMock.headObject.mockResolvedValue(null);

      await expect(
        service.completePostMediaUpload({ mediaId: 91 }, 7),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.media.update).not.toHaveBeenCalled();
    });

    it("rejects an uploaded image whose decoded format does not match the declared MIME type", async () => {
      const onePixelJpegBuffer = await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .jpeg()
        .toBuffer();

      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 7,
        status: MediaStatus.PENDING_UPLOAD,
        type: MediaType.IMAGE,
        objectKey: "posts/11/media/file/original.png",
        mimeType: "image/png",
        bytes: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      r2StorageMock.headObject.mockResolvedValue({
        contentLength: onePixelJpegBuffer.length,
        contentType: "image/png",
        etag: "etag-1",
      });
      r2StorageMock.getObjectBuffer.mockResolvedValue(onePixelJpegBuffer);

      await expect(
        service.completePostMediaUpload({ mediaId: 91 }, 7),
      ).rejects.toThrow(
        "Uploaded image format does not match the declared MIME type",
      );

      expect(prismaMock.media.update).not.toHaveBeenCalled();
    });

    it("verifies an uploaded image and stores extracted metadata", async () => {
      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 7,
        status: MediaStatus.PENDING_UPLOAD,
        type: MediaType.IMAGE,
        objectKey: "posts/11/media/file/original.png",
        mimeType: "image/png",
        bytes: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      r2StorageMock.headObject.mockResolvedValue({
        contentLength: onePixelPngBuffer.length,
        contentType: "image/png",
        etag: "etag-1",
      });
      r2StorageMock.getObjectBuffer.mockResolvedValue(onePixelPngBuffer);
      prismaMock.media.update.mockResolvedValue({
        id: 91,
        kind: MediaKind.POST_IMAGE,
        type: MediaType.IMAGE,
        status: MediaStatus.READY,
        objectKey: "posts/11/media/file/original.png",
        mimeType: "image/png",
        bytes: onePixelPngBuffer.length,
        width: 1,
        height: 1,
        durationMs: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        attachedAt: null,
      });

      const result = await service.completePostMediaUpload({ mediaId: 91 }, 7);

      const updateCall = prismaMock.media.update.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
        select: Record<string, unknown>;
      };

      expect(updateCall.where).toEqual({ id: 91 });
      expect(updateCall.data).toMatchObject({
        status: MediaStatus.READY,
        etag: "etag-1",
        bytes: onePixelPngBuffer.length,
        width: 1,
        height: 1,
        expiresAt: null,
      });
      expect(updateCall.select).toBeDefined();
      expect(result).toEqual(
        expect.objectContaining({
          id: 91,
          status: MediaStatus.READY,
          width: 1,
          height: 1,
        }),
      );
    });

    it("rejects an uploaded object that exceeds the configured image size limit", async () => {
      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 7,
        status: MediaStatus.PENDING_UPLOAD,
        type: MediaType.IMAGE,
        objectKey: "posts/11/media/file/original.png",
        mimeType: "image/png",
        bytes: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      r2StorageMock.headObject.mockResolvedValue({
        contentLength: MAX_IMAGE_BYTES + 1,
        contentType: "image/png",
        etag: "etag-1",
      });

      await expect(
        service.completePostMediaUpload({ mediaId: 91 }, 7),
      ).rejects.toThrow(
        `Image file size exceeds the maximum allowed size of ${MAX_IMAGE_BYTES} bytes`,
      );

      expect(prismaMock.media.update).not.toHaveBeenCalled();
    });

    it("uses the configured image size limit from env-backed config", async () => {
      configMock.get.mockImplementation((key: string) => {
        if (key === "MEDIA_IMAGE_MAX_BYTES") return 5;
        if (key === "MEDIA_VIDEO_MAX_BYTES") return 100 * 1024 * 1024;
        return undefined;
      });
      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 7,
        status: MediaStatus.PENDING_UPLOAD,
        type: MediaType.IMAGE,
        objectKey: "posts/11/media/file/original.png",
        mimeType: "image/png",
        bytes: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      r2StorageMock.headObject.mockResolvedValue({
        contentLength: 6,
        contentType: "image/png",
        etag: "etag-1",
      });

      await expect(
        service.completePostMediaUpload({ mediaId: 91 }, 7),
      ).rejects.toThrow(
        "Image file size exceeds the maximum allowed size of 5 bytes",
      );
    });

    it("verifies an uploaded video by inspecting its container signature", async () => {
      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 7,
        status: MediaStatus.PENDING_UPLOAD,
        type: MediaType.VIDEO,
        objectKey: "posts/11/media/file/original.mp4",
        mimeType: "video/mp4",
        bytes: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      r2StorageMock.headObject.mockResolvedValue({
        contentLength: validMp4HeaderBuffer.length,
        contentType: "video/mp4",
        etag: "etag-1",
      });
      r2StorageMock.getObjectBuffer.mockResolvedValue(validMp4HeaderBuffer);
      prismaMock.media.update.mockResolvedValue({
        id: 91,
        kind: MediaKind.POST_VIDEO,
        type: MediaType.VIDEO,
        status: MediaStatus.READY,
        objectKey: "posts/11/media/file/original.mp4",
        mimeType: "video/mp4",
        bytes: validMp4HeaderBuffer.length,
        width: null,
        height: null,
        durationMs: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        attachedAt: null,
      });

      const result = await service.completePostMediaUpload({ mediaId: 91 }, 7);

      expect(result.status).toBe(MediaStatus.READY);
      expect(result.type).toBe(MediaType.VIDEO);
      expect(result.durationMs).toBeNull();
    });

    it("rejects a video upload whose bytes do not match the claimed video container", async () => {
      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 7,
        status: MediaStatus.PENDING_UPLOAD,
        type: MediaType.VIDEO,
        objectKey: "posts/11/media/file/original.mp4",
        mimeType: "video/mp4",
        bytes: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      r2StorageMock.headObject.mockResolvedValue({
        contentLength: invalidVideoBuffer.length,
        contentType: "video/mp4",
        etag: "etag-1",
      });
      r2StorageMock.getObjectBuffer.mockResolvedValue(invalidVideoBuffer);

      await expect(
        service.completePostMediaUpload({ mediaId: 91 }, 7),
      ).rejects.toThrow("Uploaded video is invalid or corrupt");

      expect(prismaMock.media.update).not.toHaveBeenCalled();
    });
  });

  describe("attachMediaToPost", () => {
    it("attaches ready media, invalidates cache, and returns the attach-media post payload", async () => {
      prismaMock.post.findUnique
        .mockResolvedValueOnce({ id: 11, authorId: 7 })
        .mockResolvedValueOnce({
          id: 11,
          title: "Title",
          content: "Content",
          createdAt: new Date(),
          updatedAt: new Date(),
          editedAt: null,
          likesCount: 0,
          commentsCount: 0,
          viewsCount: 0,
          author: {
            id: 7,
            name: "Miguel",
            username: "miguel",
          },
          mediaAttachments: [],
        });
      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 7,
        status: MediaStatus.READY,
        type: MediaType.IMAGE,
        objectKey: "posts/11/media/file/original.jpg",
      });
      prismaMock.media.findMany.mockResolvedValue([]);
      prismaMock.postMedia.findFirst.mockResolvedValue(null);
      prismaMock.postMedia.create.mockResolvedValue({ id: 1 });
      prismaMock.media.update.mockResolvedValue({ id: 91 });
      prismaMock.$transaction.mockResolvedValue(undefined);

      const result = await service.attachMediaToPost(
        { postId: 11, mediaId: 91 },
        7,
      );

      expect(prismaMock.postMedia.create).toHaveBeenCalledWith({
        data: {
          post: { connect: { id: 11 } },
          media: { connect: { id: 91 } },
          sortOrder: 0,
        },
      });
      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:11");
      expect(result).toEqual(
        expect.objectContaining({
          id: 11,
          mediaAttachments: [],
        }),
      );
      expect(result).not.toHaveProperty("likes");
      expect(result).not.toHaveProperty("comments");
    });

    it("throws BadRequestException when media is not READY", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 11, authorId: 7 });
      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 7,
        status: MediaStatus.PENDING_UPLOAD,
        type: MediaType.IMAGE,
        objectKey: "posts/11/media/file/original.jpg",
      });

      await expect(
        service.attachMediaToPost({ postId: 11, mediaId: 91 }, 7),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.postMedia.create).not.toHaveBeenCalled();
    });

    it("checks attachment limits against attached READY media when attaching", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 11, authorId: 7 });
      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 7,
        status: MediaStatus.READY,
        type: MediaType.IMAGE,
        objectKey: "posts/11/media/file/original.jpg",
      });
      prismaMock.media.findMany.mockResolvedValue([
        { id: 22, type: MediaType.IMAGE },
      ]);
      prismaMock.postMedia.findFirst.mockResolvedValue(null);
      prismaMock.$transaction.mockResolvedValue(undefined);
      prismaMock.post.findUnique
        .mockResolvedValueOnce({ id: 11, authorId: 7 })
        .mockResolvedValueOnce({
          id: 11,
          title: "Title",
          content: "Content",
          createdAt: new Date(),
          updatedAt: new Date(),
          editedAt: null,
          likesCount: 0,
          commentsCount: 0,
          viewsCount: 0,
          author: {
            id: 7,
            name: "Miguel",
            username: "miguel",
          },
          mediaAttachments: [],
        });

      await service.attachMediaToPost({ postId: 11, mediaId: 91 }, 7);

      const findManyCall = prismaMock.media.findMany.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      const where = findManyCall.where as {
        id: { not: number };
        OR: Array<Record<string, unknown>>;
      };

      expect(where.id).toEqual({ not: 91 });
      expect(where.OR).toEqual([
        {
          postAttachments: {
            some: {
              postId: 11,
            },
          },
          status: MediaStatus.READY,
        },
      ]);
    });

    it("maps duplicate attachment errors to BadRequestException", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 11, authorId: 7 });
      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 7,
        status: MediaStatus.READY,
        type: MediaType.IMAGE,
        objectKey: "posts/11/media/file/original.jpg",
      });
      prismaMock.media.findMany.mockResolvedValue([]);
      prismaMock.postMedia.findFirst.mockResolvedValue(null);
      prismaMock.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "test",
        }),
      );

      await expect(
        service.attachMediaToPost({ postId: 11, mediaId: 91 }, 7),
      ).rejects.toThrow("Media is already attached to this post");
    });

    it("maps missing post or media attachment write errors to NotFoundException", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 11, authorId: 7 });
      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 7,
        status: MediaStatus.READY,
        type: MediaType.IMAGE,
        objectKey: "posts/11/media/file/original.jpg",
      });
      prismaMock.media.findMany.mockResolvedValue([]);
      prismaMock.postMedia.findFirst.mockResolvedValue(null);
      prismaMock.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("missing", {
          code: "P2025",
          clientVersion: "test",
        }),
      );

      await expect(
        service.attachMediaToPost({ postId: 11, mediaId: 91 }, 7),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("myMedia", () => {
    it("caps pagination and returns a cursor page ordered newest first by default", async () => {
      prismaMock.media.findMany.mockResolvedValue([]);

      await service.myMedia(7, {
        first: PAGINATION.MAX_TAKE + 10,
        orderBy: ChronologicalOrder.NEWEST,
      });

      const findManyCall = prismaMock.media.findMany.mock
        .calls[0]?.[0] as unknown as MyMediaFindManyCall;

      expect(findManyCall.where).toEqual({ ownerId: 7 });
      expect(findManyCall.take).toBe(PAGINATION.MAX_TAKE + 1);
      expect(findManyCall.orderBy).toEqual([
        { createdAt: "desc" },
        { id: "desc" },
      ]);
      expect(findManyCall.select).toMatchObject({
        id: true,
        bytes: true,
      });
    });

    it("applies the media cursor filter and returns a page result", async () => {
      prismaMock.media.findMany.mockResolvedValue([]);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      const result = await service.myMedia(7, {
        first: 5,
        after,
      });

      const findManyCall = prismaMock.media.findMany.mock
        .calls[0]?.[0] as unknown as MyMediaFindManyCall;

      expect(findManyCall.where).toEqual({
        AND: [
          { ownerId: 7 },
          {
            OR: [
              { createdAt: { lt: new Date("2026-04-10T00:00:00.000Z") } },
              {
                createdAt: new Date("2026-04-10T00:00:00.000Z"),
                id: { lt: 999 },
              },
            ],
          },
        ],
      });
      expect(findManyCall.take).toBe(6);
      expect(result).toEqual({
        items: [],
        pageInfo: {
          endCursor: null,
          hasNextPage: false,
        },
      });
    });

    it("throws for an invalid media cursor", async () => {
      await expect(
        service.myMedia(7, { first: 5, after: "%%%invalid%%%" }),
      ).rejects.toThrow("Invalid cursor");

      expect(prismaMock.media.findMany).not.toHaveBeenCalled();
    });

    it("uses ascending tie-breaker filtering for OLDEST media pagination", async () => {
      prismaMock.media.findMany.mockResolvedValue([]);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      await service.myMedia(7, {
        first: 5,
        after,
        orderBy: ChronologicalOrder.OLDEST,
      });

      const findManyCall = prismaMock.media.findMany.mock
        .calls[0]?.[0] as unknown as MyMediaFindManyCall;

      expect(findManyCall.where).toEqual({
        AND: [
          { ownerId: 7 },
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
      });
      expect(findManyCall.orderBy).toEqual([
        { createdAt: "asc" },
        { id: "asc" },
      ]);
      expect(findManyCall.take).toBe(6);
    });
  });

  describe("createMediaSignedViewUrl", () => {
    it("returns a signed GET URL for owned READY media", async () => {
      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 7,
        status: MediaStatus.READY,
        type: MediaType.IMAGE,
        objectKey: "posts/11/media/file/original.png",
      });
      r2StorageMock.createPresignedGetUrl.mockResolvedValue(
        "https://view.example.com",
      );

      const result = await service.createMediaSignedViewUrl(91, 7);

      expect(r2StorageMock.createPresignedGetUrl).toHaveBeenCalledWith(
        "posts/11/media/file/original.png",
      );
      expect(result.mediaId).toBe(91);
      expect(result.url).toBe("https://view.example.com");
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it("rejects non-READY media", async () => {
      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 7,
        status: MediaStatus.PENDING_UPLOAD,
        type: MediaType.IMAGE,
        objectKey: "posts/11/media/file/original.png",
      });

      await expect(service.createMediaSignedViewUrl(91, 7)).rejects.toThrow(
        "Media must be READY before a view URL can be created",
      );

      expect(r2StorageMock.createPresignedGetUrl).not.toHaveBeenCalled();
    });

    it("rejects view URL creation for media owned by a different user", async () => {
      prismaMock.media.findUnique.mockResolvedValue({
        id: 91,
        ownerId: 99,
        status: MediaStatus.READY,
        type: MediaType.IMAGE,
        objectKey: "posts/11/media/file/original.png",
      });

      await expect(
        service.createMediaSignedViewUrl(91, 7),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(r2StorageMock.createPresignedGetUrl).not.toHaveBeenCalled();
    });
  });
});
