import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import { NotificationsService } from "@/notifications/notifications.service";
import { CacheHelperService } from "@/common/cache/cache-helper.service";

import { PAGINATION } from "@/common/constants/hard-cap.constants";

import { FindLikesArgs } from "@/common/args/find-likes.args";

import { LikeDetailDTO, LikeDetailSelect } from "@/likes/dto/like-detail.dto";

import { NotificationType, Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma.service";

@Injectable()
export class LikesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findLikes(params?: FindLikesArgs): Promise<LikeDetailDTO[]> {
    const take = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    const postId = params?.postId;
    const userId = params?.userId;

    const v = await this.cacheHelper.getVersion("v:likes:list");

    const cacheKey = `likes:list:v${v}:${take}:p${postId ?? "all"}:u${userId ?? "all"}`;

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
            createdAt: "desc",
          },

          select: LikeDetailSelect,
        });
      },
      30_000,
    );
  }

  async getLike(id: number): Promise<LikeDetailDTO> {
    const cacheKey = `like:detail:${id}`;

    try {
      return await this.cacheHelper.getOrSet(
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
    } catch (err) {
      if (err instanceof NotFoundException) throw err;

      throw new InternalServerErrorException("Failed to fetch like");
    }
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

    try {
      // Single transaction to keep the like row creation and post counter update consistent
      const [like] = await this.prisma.$transaction([
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

      // Invalidate / bump cache only for data affected by this write
      await this.cacheHelper.bumpVersion("v:likes:list");
      await this.cacheHelper.del(`posts:detail:${postId}`);
      await this.cacheHelper.bumpVersion("v:posts:list");

      // Notifications are best-effort:
      // the like should succeed even if real-time delivery fails
      try {
        await this.notificationsService.createAndPublishNotification({
          recipientId: post.authorId,
          actorId: currentUserId,
          type: NotificationType.POST_LIKED,
          title: "New like",
          body: `${currentUser.username} liked your post`,
          entityId: postId,
        });
      } catch (error) {
        console.error("Failed to create like notification", error);
      }

      return like;
    } catch (err: unknown) {
      // Unique constraint: same user already liked the same post
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          throw new ConflictException("You already liked this post");
        }

        // Foreign key / missing record problems
        if (err.code === "P2003" || err.code === "P2025") {
          throw new NotFoundException("Post not found");
        }
      }

      throw new InternalServerErrorException("Failed to create like");
    }
  }

  async deleteLike(id: number, currentUserId: number) {
    try {
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

      if (like.userId !== currentUserId)
        throw new ForbiddenException(
          "You do not have permission to delete this like",
        );

      // Delete like + decrement counter safely
      await this.prisma.$transaction(async (tx) => {
        // Delete frist so the counter is only decremented if the like really exists
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

      // Invalidate / bump only the caches affected by this write
      await this.cacheHelper.del(`like:detail:${id}`);
      await this.cacheHelper.bumpVersion("v:likes:list");

      await this.cacheHelper.del(`posts:detail:${like.postId}`);
      await this.cacheHelper.bumpVersion("v:posts:list");

      return {
        message: "Like deleted successfully",
      };
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ForbiddenException)
        throw err;

      // Optional: if post was deleted but like existed (FK / race conditions)
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      )
        throw new NotFoundException("Like or post not found");

      throw new InternalServerErrorException("Failed to delete like");
    }
  }
}
