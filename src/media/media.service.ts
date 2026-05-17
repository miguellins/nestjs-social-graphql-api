import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { type RequestPostMediaUpload } from "@/media/models/request-post-media-upload.model";
import { MediaReadProjectionService } from "@/media/media-read-projection.service";
import { type SafeMediaDTO, SafeMediaSelect } from "@/media/dto/safe-media.dto";
import { MediaValidationService } from "@/media/media-validation.service";
import { type MediaViewUrl } from "@/media/models/media-view-url.model";
import { R2StorageService } from "@/media/storage/r2-storage.service";
import { MediaPolicyService } from "@/media/media-policy.service";
import {
  MediaQueryService,
  type MediaPaginationParams,
} from "@/media/media-query.service";
import {
  type AttachMediaToPostCommand,
  MAX_IMAGE_BYTES,
  MAX_PROFILE_AVATAR_BYTES,
  MAX_PROFILE_AVATAR_DIMENSION,
  MIN_PROFILE_AVATAR_DIMENSION,
  MAX_VIDEO_BYTES,
  attachMediaToPostCommandSchema,
  type CompleteProfileAvatarUploadCommand,
  completeProfileAvatarUploadCommandSchema,
  type CompletePostMediaUploadCommand,
  completePostMediaUploadCommandSchema,
  type RequestProfileAvatarUploadInputCommand,
  requestProfileAvatarUploadCommandSchema,
  type RequestPostMediaUploadInputCommand,
  requestPostMediaUploadCommandSchema,
} from "@/media/schemas/media-write.schema";

import { type CursorPageResult } from "@/common/pagination/cursor-pagination";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";

import { type SafeAttachMediaPostDTO } from "@/posts/dto/safe-attach-media-post.dto";

import { PrismaService } from "@/prisma/prisma.service";
import {
  MediaKind,
  MediaVisibility,
  MediaStatus,
  MediaType,
  Prisma,
  StorageProvider,
} from "@prisma/client";

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly r2Storage: R2StorageService,
    private readonly configService: ConfigService,
    private readonly mediaPolicy: MediaPolicyService,
    private readonly mediaReadProjection: MediaReadProjectionService,
    private readonly mediaQuery: MediaQueryService,
    private readonly mediaValidation: MediaValidationService,
  ) {}

  // Creates a pending media record and returns the direct-upload instructions
  async requestPostMediaUpload(
    input: RequestPostMediaUploadInputCommand,
    currentUserId: number,
  ): Promise<RequestPostMediaUpload> {
    const data = this.parseRequestPostMediaUploadInput(input);

    await this.mediaPolicy.assertPostOwnership(data.postId, currentUserId);
    await this.mediaPolicy.assertPostMediaConstraints(
      data.postId,
      data.type,
      undefined,
      {
        includePendingReservations: true,
      },
    );

    const objectKey = this.mediaValidation.buildObjectKey(
      data.postId,
      data.mimeType,
    );
    const publicUrl = this.r2Storage.getPublicUrl(objectKey);
    const expiresAt = new Date(
      Date.now() + this.r2Storage.getPresignedUrlTtlSeconds() * 1000,
    );

    let media: { id: number };

    try {
      media = await this.prisma.media.create({
        data: {
          owner: { connect: { id: currentUserId } },
          kind: data.kind,
          type: data.type,
          status: MediaStatus.PENDING_UPLOAD,
          visibility: MediaVisibility.PUBLIC,
          storageProvider: StorageProvider.R2,
          bucket: this.r2Storage.getBucket(),
          objectKey,
          originalFileName: data.originalFileName,
          mimeType: data.mimeType,
          expiresAt,
        },
        select: {
          id: true,
        },
      });
    } catch (error) {
      this.throwUnexpectedPersistenceFailure(
        "create pending media upload",
        error,
      );
    }

    let uploadUrl: string;

    try {
      uploadUrl = await this.r2Storage.createPresignedPutUrl({
        objectKey,
        contentType: data.mimeType,
      });
    } catch (error) {
      await runBestEffort(
        this.logger,
        "error",
        `Failed to clean up pending media ${media.id} after presigned URL creation failure`,
        async () => {
          await this.prisma.media.delete({
            where: { id: media.id },
          });
        },
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(
        "Failed to create media upload URL",
      );
    }

    return {
      mediaId: media.id,
      uploadUrl,
      publicUrl,
      expiresAt,
    };
  }

  /** Creates a pending profile-avatar media record and returns direct-upload instructions. */
  async requestProfileAvatarUpload(
    input: RequestProfileAvatarUploadInputCommand,
    currentUserId: number,
  ): Promise<RequestPostMediaUpload> {
    this.assertMediaStorageConfigured();

    const data = this.parseRequestProfileAvatarUploadInput(input);
    const objectKey = this.mediaValidation.buildProfileAvatarObjectKey(
      currentUserId,
      data.mimeType,
    );
    const publicUrl = this.r2Storage.getPublicUrl(objectKey);
    const expiresAt = new Date(
      Date.now() + this.r2Storage.getPresignedUrlTtlSeconds() * 1000,
    );

    let media: { id: number };

    try {
      media = await this.prisma.media.create({
        data: {
          owner: { connect: { id: currentUserId } },
          kind: data.kind,
          type: data.type,
          status: MediaStatus.PENDING_UPLOAD,
          visibility: MediaVisibility.PUBLIC,
          storageProvider: StorageProvider.R2,
          bucket: this.r2Storage.getBucket(),
          objectKey,
          originalFileName: data.originalFileName,
          mimeType: data.mimeType,
          expiresAt,
        },
        select: {
          id: true,
        },
      });
    } catch (error) {
      this.throwUnexpectedPersistenceFailure(
        "create pending profile avatar upload",
        error,
      );
    }

    let uploadUrl: string;

    try {
      uploadUrl = await this.r2Storage.createPresignedPutUrl({
        objectKey,
        contentType: data.mimeType,
      });
    } catch (error) {
      await runBestEffort(
        this.logger,
        "error",
        `Failed to clean up pending profile avatar ${media.id} after presigned URL creation failure`,
        async () => {
          await this.prisma.media.delete({
            where: { id: media.id },
          });
        },
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(
        "Failed to create profile avatar upload URL",
      );
    }

    return {
      mediaId: media.id,
      uploadUrl,
      publicUrl,
      expiresAt,
    };
  }

  // Verifies the uploaded object in R2 and marks the media record ready
  async completePostMediaUpload(
    input: CompletePostMediaUploadCommand,
    currentUserId: number,
  ): Promise<SafeMediaDTO> {
    const data = this.parseCompletePostMediaUploadInput(input);
    const media = await this.mediaPolicy.getOwnedMediaById(
      data.mediaId,
      currentUserId,
    );

    if (media.status === MediaStatus.READY) {
      throw new BadRequestException("Media upload is already complete");
    }

    if (media.status !== MediaStatus.PENDING_UPLOAD) {
      throw new BadRequestException(
        "Media upload is not in a completable state",
      );
    }

    if (media.expiresAt && media.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Media upload has expired");
    }

    const head = await this.r2Storage.headObject(media.objectKey);

    if (!head) {
      throw new BadRequestException("Uploaded media object was not found");
    }

    const normalizedStoredMimeType = this.mediaValidation.normalizeMimeType(
      head.contentType,
    );

    if (
      !normalizedStoredMimeType ||
      normalizedStoredMimeType !== media.mimeType
    ) {
      throw new BadRequestException("Uploaded media MIME type does not match");
    }

    if (head.contentLength === null || head.contentLength <= 0) {
      throw new BadRequestException("Uploaded media object size is invalid");
    }

    const maxBytes =
      media.type === MediaType.IMAGE
        ? (this.configService.get<number>("MEDIA_IMAGE_MAX_BYTES") ??
          MAX_IMAGE_BYTES)
        : (this.configService.get<number>("MEDIA_VIDEO_MAX_BYTES") ??
          MAX_VIDEO_BYTES);

    if (head.contentLength > maxBytes) {
      throw new BadRequestException(
        `${
          media.type === MediaType.IMAGE ? "Image" : "Video"
        } file size exceeds the maximum allowed size of ${maxBytes} bytes`,
      );
    }

    const mediaMetadata = await this.mediaValidation.inspectMediaObject(
      media.objectKey,
      media.type,
      media.mimeType,
    );

    try {
      const mediaRecord = await this.prisma.media.update({
        where: { id: media.id },
        data: {
          status: MediaStatus.READY,
          etag: head.etag,
          bytes: head.contentLength,
          width: mediaMetadata.width ?? null,
          height: mediaMetadata.height ?? null,
          durationMs: mediaMetadata.durationMs ?? null,
          expiresAt: null,
        },
        select: SafeMediaSelect,
      });

      return this.mediaReadProjection.derivePublicUrl(mediaRecord);
    } catch (error) {
      this.throwUnexpectedPersistenceFailure("complete media upload", error);
    }
  }

  /** Verifies a profile avatar upload, marks it ready, and assigns it to the user. */
  async completeProfileAvatarUpload(
    input: CompleteProfileAvatarUploadCommand,
    currentUserId: number,
  ): Promise<SafeMediaDTO> {
    this.assertMediaStorageConfigured();

    const data = this.parseCompleteProfileAvatarUploadInput(input);
    const media = await this.mediaPolicy.getOwnedMediaById(
      data.mediaId,
      currentUserId,
    );

    if (
      media.kind !== MediaKind.PROFILE_AVATAR ||
      media.type !== MediaType.IMAGE
    ) {
      throw new BadRequestException("Media is not a profile avatar upload");
    }

    if (media.status === MediaStatus.READY) {
      throw new BadRequestException(
        "Profile avatar upload is already complete",
      );
    }

    if (media.status !== MediaStatus.PENDING_UPLOAD) {
      throw new BadRequestException(
        "Profile avatar upload is not in a completable state",
      );
    }

    if (media.expiresAt && media.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Profile avatar upload has expired");
    }

    const head = await this.r2Storage.headObject(media.objectKey);

    if (!head) {
      throw new BadRequestException(
        "Uploaded profile avatar object was not found",
      );
    }

    const normalizedStoredMimeType = this.mediaValidation.normalizeMimeType(
      head.contentType,
    );

    if (
      !normalizedStoredMimeType ||
      normalizedStoredMimeType !== media.mimeType
    ) {
      throw new BadRequestException(
        "Uploaded profile avatar MIME type does not match",
      );
    }

    const maxBytes =
      this.configService.get<number>("MEDIA_PROFILE_AVATAR_MAX_BYTES") ??
      MAX_PROFILE_AVATAR_BYTES;

    if (head.contentLength === null || head.contentLength <= 0) {
      throw new BadRequestException(
        "Uploaded profile avatar object size is invalid",
      );
    }

    if (head.contentLength > maxBytes) {
      throw new BadRequestException(
        `Profile avatar file size exceeds the maximum allowed size of ${maxBytes} bytes`,
      );
    }

    const mediaMetadata = await this.mediaValidation.inspectMediaObject(
      media.objectKey,
      media.type,
      media.mimeType,
    );

    this.assertProfileAvatarDimensions(
      mediaMetadata.width,
      mediaMetadata.height,
    );

    const previousAvatar = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        username: true,
        avatarMedia: {
          select: {
            id: true,
            objectKey: true,
            status: true,
          },
        },
      },
    });

    if (!previousAvatar) {
      throw new NotFoundException("User not found");
    }

    let mediaRecord: SafeMediaDTO;

    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const updatedMedia = await tx.media.update({
          where: { id: media.id },
          data: {
            status: MediaStatus.READY,
            etag: head.etag,
            bytes: head.contentLength,
            width: mediaMetadata.width ?? null,
            height: mediaMetadata.height ?? null,
            durationMs: null,
            expiresAt: null,
            attachedAt: new Date(),
          },
          select: SafeMediaSelect,
        });

        await tx.user.update({
          where: { id: currentUserId },
          data: {
            avatarMedia: {
              connect: { id: media.id },
            },
          },
          select: { id: true },
        });

        return updatedMedia;
      });

      mediaRecord = this.mediaReadProjection.derivePublicUrl(record);
    } catch (error) {
      this.throwUnexpectedPersistenceFailure(
        "complete profile avatar upload",
        error,
      );
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate user caches after updating profile avatar for user ${currentUserId}`,
      async () => {
        await this.cacheHelper.del(`user:safe:${currentUserId}`);
        await this.cacheHelper.del(
          `user:lookup:username:${previousAvatar.username}`,
        );
        await this.cacheHelper.bumpVersion("v:user:list");
      },
    );

    const oldAvatar = previousAvatar.avatarMedia;

    if (
      oldAvatar &&
      oldAvatar.id !== media.id &&
      oldAvatar.status === MediaStatus.READY
    ) {
      await runBestEffort(
        this.logger,
        "error",
        `Failed to delete previous profile avatar ${oldAvatar.id} for user ${currentUserId}`,
        async () => {
          await this.prisma.media.delete({
            where: { id: oldAvatar.id },
          });
          await this.r2Storage.deleteObject(oldAvatar.objectKey);
        },
      );
    }

    return mediaRecord;
  }

  // Attaches a verified media item to one owned post and invalidates the post detail cache
  async attachMediaToPost(
    input: AttachMediaToPostCommand,
    currentUserId: number,
  ): Promise<SafeAttachMediaPostDTO> {
    const data = this.parseAttachMediaToPostInput(input);

    await this.mediaPolicy.assertPostOwnership(data.postId, currentUserId);

    const media = await this.mediaPolicy.getOwnedMediaById(
      data.mediaId,
      currentUserId,
    );

    if (media.status !== MediaStatus.READY) {
      throw new BadRequestException(
        "Media must be READY before it can be attached",
      );
    }

    const intendedPostId = this.mediaValidation.getPostIdFromObjectKey(
      media.objectKey,
    );

    if (intendedPostId !== data.postId) {
      throw new BadRequestException(
        "Media can only be attached to the post it was uploaded for",
      );
    }

    await this.mediaPolicy.assertPostMediaConstraints(
      data.postId,
      media.type,
      media.id,
      {
        includePendingReservations: false,
      },
    );

    await this.attachMediaToPostWithRetry(data.postId, media.id);

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after attaching media ${media.id} to post ${data.postId}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${data.postId}`);
      },
    );

    return this.mediaQuery.getAttachMediaPostResult(data.postId);
  }

  // Lists the current user's uploaded media using bounded chronological pagination
  async myMedia(
    currentUserId: number,
    params?: MediaPaginationParams,
  ): Promise<CursorPageResult<SafeMediaDTO>> {
    return this.mediaQuery.myMedia(currentUserId, params);
  }

  // Returns an owner-only temporary signed URL for reading one READY media object
  async createMediaSignedViewUrl(
    mediaId: number,
    currentUserId: number,
  ): Promise<MediaViewUrl> {
    const media = await this.mediaPolicy.getOwnedMediaById(
      mediaId,
      currentUserId,
    );

    if (media.status !== MediaStatus.READY) {
      throw new BadRequestException(
        "Media must be READY before a view URL can be created",
      );
    }

    const signedUrl = await this.r2Storage.createPresignedGetUrl(
      media.objectKey,
    );
    const expiresAt = new Date(
      Date.now() + this.r2Storage.getPresignedUrlTtlSeconds() * 1000,
    );

    return {
      mediaId: media.id,
      url: signedUrl,
      expiresAt,
    };
  }

  // Private Helpers
  // Attaches media with a bounded retry only for concurrent sort-order collisions.
  private async attachMediaToPostWithRetry(
    postId: number,
    mediaId: number,
  ): Promise<void> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const nextSortOrder = await this.getNextSortOrder(tx, postId);

          await tx.postMedia.create({
            data: {
              post: { connect: { id: postId } },
              media: { connect: { id: mediaId } },
              sortOrder: nextSortOrder,
            },
          });

          await tx.media.update({
            where: { id: mediaId },
            data: {
              attachedAt: new Date(),
            },
          });
        });

        return;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2002") {
            const target = this.getUniqueConstraintTarget(error);

            if (target.includes("postId") && target.includes("mediaId")) {
              throw new BadRequestException(
                "Media is already attached to this post",
              );
            }

            if (
              target.includes("postId") &&
              target.includes("sortOrder") &&
              attempt < maxAttempts
            ) {
              continue;
            }

            if (
              target.includes("postId") &&
              target.includes("sortOrder") &&
              attempt === maxAttempts
            ) {
              throw new BadRequestException(
                "Could not reserve media attachment order for this post",
              );
            }
          }

          if (error.code === "P2003" || error.code === "P2025") {
            throw new NotFoundException("Post or media not found");
          }
        }

        this.throwUnexpectedPersistenceFailure("attach media to post", error);
      }
    }
  }

  // Returns the next attachment ordering value for one post inside the current transaction.
  private async getNextSortOrder(
    tx: Pick<PrismaService, "postMedia">,
    postId: number,
  ): Promise<number> {
    const latestAttachment = await tx.postMedia.findFirst({
      where: { postId },
      orderBy: {
        sortOrder: "desc",
      },
      select: {
        sortOrder: true,
      },
    });

    return (latestAttachment?.sortOrder ?? -1) + 1;
  }

  // Extracts the Prisma unique-target field list from a known request error.
  private getUniqueConstraintTarget(
    error: Prisma.PrismaClientKnownRequestError,
  ): string[] {
    const target = (error.meta as { target?: string[] | string } | undefined)
      ?.target;

    if (Array.isArray(target)) {
      return target;
    }

    return typeof target === "string" ? [target] : [];
  }

  // Parses and normalizes request-upload input for the service layer
  private parseRequestPostMediaUploadInput(
    input: RequestPostMediaUploadInputCommand,
  ) {
    return parseWithBadRequest(
      requestPostMediaUploadCommandSchema,
      input,
      "Invalid media upload request input",
    );
  }

  // Parses and normalizes complete-upload input for the service layer
  private parseCompletePostMediaUploadInput(
    input: CompletePostMediaUploadCommand,
  ) {
    return parseWithBadRequest(
      completePostMediaUploadCommandSchema,
      input,
      "Invalid media upload completion input",
    );
  }

  /** Parses and normalizes profile-avatar request-upload input for the service layer. */
  private parseRequestProfileAvatarUploadInput(
    input: RequestProfileAvatarUploadInputCommand,
  ) {
    return parseWithBadRequest(
      requestProfileAvatarUploadCommandSchema,
      input,
      "Invalid profile avatar upload request input",
    );
  }

  /** Parses and normalizes profile-avatar completion input for the service layer. */
  private parseCompleteProfileAvatarUploadInput(
    input: CompleteProfileAvatarUploadCommand,
  ) {
    return parseWithBadRequest(
      completeProfileAvatarUploadCommandSchema,
      input,
      "Invalid profile avatar upload completion input",
    );
  }

  // Parses and normalizes attach-media input for the service layer
  private parseAttachMediaToPostInput(input: AttachMediaToPostCommand) {
    return parseWithBadRequest(
      attachMediaToPostCommandSchema,
      input,
      "Invalid attach media input",
    );
  }

  /** Ensures avatar upload operations fail clearly when storage is disabled. */
  private assertMediaStorageConfigured(): void {
    if (!this.r2Storage.isConfigured()) {
      throw new ServiceUnavailableException("Media storage is not configured");
    }
  }

  /** Validates profile avatar dimensions are square and within avatar limits. */
  private assertProfileAvatarDimensions(
    width: number | undefined,
    height: number | undefined,
  ): void {
    if (!width || !height) {
      throw new BadRequestException("Profile avatar image metadata is invalid");
    }

    if (width !== height) {
      throw new BadRequestException("Profile avatar image must be square");
    }

    if (
      width < MIN_PROFILE_AVATAR_DIMENSION ||
      height < MIN_PROFILE_AVATAR_DIMENSION ||
      width > MAX_PROFILE_AVATAR_DIMENSION ||
      height > MAX_PROFILE_AVATAR_DIMENSION
    ) {
      throw new BadRequestException(
        `Profile avatar dimensions must be between ${MIN_PROFILE_AVATAR_DIMENSION} and ${MAX_PROFILE_AVATAR_DIMENSION} pixels`,
      );
    }
  }

  // Throws one sanitized persistence failure for unexpected media writes
  private throwUnexpectedPersistenceFailure(
    action:
      | "create pending media upload"
      | "create pending profile avatar upload"
      | "complete media upload"
      | "complete profile avatar upload"
      | "attach media to post",
    error: unknown,
  ): never {
    if (error instanceof HttpException) {
      throw error;
    }

    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      error instanceof Error ? error.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}
