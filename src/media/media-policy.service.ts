import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { MediaValidationService } from "@/media/media-validation.service";

import { type Media, MediaStatus, MediaType } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

const MAX_ATTACHMENTS_PER_POST = 4;
const MAX_VIDEOS_PER_POST = 1;

@Injectable()
export class MediaPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaValidation: MediaValidationService,
  ) {}

  async assertPostOwnership(
    postId: number,
    currentUserId: number,
  ): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        authorId: true,
        removedAt: true,
      },
    });

    if (!post || post.removedAt) {
      throw new NotFoundException("Post not found");
    }

    if (post.authorId !== currentUserId) {
      throw new ForbiddenException(
        "You do not have permission to manage media for this post",
      );
    }
  }

  async getOwnedMediaById(
    mediaId: number,
    currentUserId: number,
  ): Promise<Media> {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new NotFoundException("Media not found");
    }

    if (media.ownerId !== currentUserId) {
      throw new ForbiddenException(
        "You do not have permission to manage this media item",
      );
    }

    return media;
  }

  async assertPostMediaConstraints(
    postId: number,
    incomingType: MediaType,
    ignoreMediaId?: number,
    options?: {
      includePendingReservations: boolean;
    },
  ): Promise<void> {
    const now = new Date();
    const includePendingReservations =
      options?.includePendingReservations ?? true;
    const existingMedia = await this.prisma.media.findMany({
      where: {
        ...(ignoreMediaId !== undefined
          ? {
              id: {
                not: ignoreMediaId,
              },
            }
          : {}),
        OR: [
          {
            postAttachments: {
              some: {
                postId,
              },
            },
            status: MediaStatus.READY,
          },
          ...(includePendingReservations
            ? [
                {
                  objectKey: {
                    startsWith:
                      this.mediaValidation.getPostObjectKeyPrefix(postId),
                  },
                  status: MediaStatus.PENDING_UPLOAD,
                  expiresAt: {
                    gt: now,
                  },
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        type: true,
      },
    });

    if (existingMedia.length >= MAX_ATTACHMENTS_PER_POST) {
      throw new BadRequestException(
        `A post can have at most ${MAX_ATTACHMENTS_PER_POST} media attachments`,
      );
    }

    const existingVideoCount = existingMedia.filter(
      (media) => media.type === MediaType.VIDEO,
    ).length;

    const hasImages = existingMedia.some(
      (media) => media.type === MediaType.IMAGE,
    );
    const hasVideos = existingVideoCount > 0;

    if (
      incomingType === MediaType.VIDEO &&
      existingVideoCount >= MAX_VIDEOS_PER_POST
    ) {
      throw new BadRequestException(
        `A post can have at most ${MAX_VIDEOS_PER_POST} video attachment`,
      );
    }

    if (
      (incomingType === MediaType.IMAGE && hasVideos) ||
      (incomingType === MediaType.VIDEO && hasImages)
    ) {
      throw new BadRequestException(
        "Posts cannot mix image and video attachments in v1",
      );
    }
  }
}
