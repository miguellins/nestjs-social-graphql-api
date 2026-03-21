import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { runBestEffort } from "@/common/errors/run-best-effort";

import type { LikeDetailDTO } from "@/likes/dto/like-detail.dto";
import { LikeDetailSelect } from "@/likes/dto/like-detail.dto";

import { NotificationsService } from "@/notifications/notifications.service";

import { NotificationType, Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma.service";

type FindLikesParams = {
  take?: number;
  orderBy?: ChronologicalOrder;
  postId?: number;
  userId?: number;
};

/**
 * Service for like workflows
 *
 * Creates, lists, and deletes likes
 */

@Injectable()
export class LikesService {
  private readonly logger = new Logger(LikesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findLikes(params?: FindLikesParams): Promise<LikeDetailDTO[]> {
    const take = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    const postId = params?.postId;
    const userId = params?.userId === 0 ? undefined : params?.userId;

    // Default to newest-first when no explicit chronological order is provided
    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;

    const v = await this.cacheHelper.getVersion("v:likes:list");

    const cacheKey = `likes:list:v${v}:${take}:p${postId ?? "all"}:u${userId ?? "all"}:order=${orderby}`;

    // Let unexpected read failures bubble so the global filter remains the main normalizer
    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const where: Prisma.LikeWhereInput = {
          ...(postId !== undefined && { postId }),
          ...(userId !== undefined && { userId }),
        };

        return this.prisma.like.findMany({
          take,
          where,

          orderBy: {
            createdAt: toSortDirection(orderby),
          },

          select: LikeDetailSelect,
        });
      },
      30_000,
    );
  }

  async getLike(id: number): Promise<LikeDetailDTO> {
    const cacheKey = `like:detail:${id}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const like = await this.prisma.like.findUnique({
          where: { id },

          select: LikeDetailSelect,
        });

        if (!like) throw new NotFoundException("Like not found");

        return like;
      },
      30_000,
    );
  }

  async createLike(
    currentUserId: number,
    postId: number,
  ): Promise<LikeDetailDTO> {
    // Read the minimum data needed for validation and notification building
    const [currentUser, post] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: currentUserId },
        select: {
          id: true,
          username: true,
        },
      }),

      this.prisma.post.findUnique({
        where: { id: postId },
        select: {
          id: true,
          authorId: true,
        },
      }),
    ]);

    if (!currentUser) throw new NotFoundException("Current user not found");
    if (!post) throw new NotFoundException("Post not found");

    // Store the created like outside the try block so follow-up work can reuse it
    let like: LikeDetailDTO;

    try {
      // Single transaction to keep the like row creation and post counter update consistent
      [like] = await this.prisma.$transaction([
        this.prisma.like.create({
          data: {
            userId: currentUserId,
            postId,
          },

          select: LikeDetailSelect,
        }),

        this.prisma.post.update({
          where: { id: postId },
          data: { likesCount: { increment: 1 } },
          select: { id: true },
        }),
      ]);
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Keep duplicate likes as an explicit business conflict
        if (err.code === "P2002") {
          throw new ConflictException("You already liked this post");
        }

        // Preserve the post-not-found domain response for relation races
        if (err.code === "P2003" || err.code === "P2025") {
          throw new NotFoundException("Post not found");
        }
      }

      throw err;
    }

    // Keep cache refresh failures from masking a committed like creation
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after creating like for post ${postId}`,
      async () => {
        await this.cacheHelper.bumpVersion("v:likes:list");
        await this.cacheHelper.del(`posts:detail:${postId}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
      },
    );

    // Keep notification delivery best-effort because the like write already succeeded
    await runBestEffort(
      this.logger,
      "error",
      `Failed to create like notification for post ${postId}`,
      async () => {
        await this.notificationsService.createAndPublishNotification({
          recipientId: post.authorId,
          actorId: currentUserId,
          type: NotificationType.POST_LIKED,
          title: "New like",
          body: `${currentUser.username} liked your post`,
          entityId: postId,
        });
      },
    );

    return like;
  }

  async deleteLike(
    id: number,
    currentUserId: number,
  ): Promise<MessageResponse> {
    // Validate existence + ownership + post target
    const like = await this.prisma.like.findUnique({
      where: { id },

      select: {
        id: true,
        userId: true,
        postId: true,
      },
    });

    if (!like) throw new NotFoundException("Like not found");

    if (like.userId !== currentUserId) {
      throw new ForbiddenException(
        "You do not have permission to delete this like",
      );
    }

    try {
      // Delete like + decrement counter safely
      await this.prisma.$transaction(async (tx) => {
        // Delete first so the counter is only decremented if the like really exists
        await tx.like.delete({ where: { id: like.id } });

        // Decrement likesCount, but never let it go below 0
        await tx.post.update({
          where: { id: like.postId },

          data: {
            likesCount: {
              decrement: 1,
            },
          },

          select: { id: true },
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        // Preserve the local not-found response when the like or post disappears mid-delete
        throw new NotFoundException("Like or post not found");
      }

      throw err;
    }

    // Keep cache refresh failures from masking a committed like deletion
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after deleting like ${id}`,
      async () => {
        await this.cacheHelper.del(`like:detail:${id}`);
        await this.cacheHelper.bumpVersion("v:likes:list");
        await this.cacheHelper.del(`posts:detail:${like.postId}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
      },
    );

    return {
      message: "Like deleted successfully",
    };
  }
}
