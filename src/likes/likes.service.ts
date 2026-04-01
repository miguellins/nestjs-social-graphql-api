import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { runBestEffort } from "@/common/errors/run-best-effort";
import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";

import {
  type LikeDetailDTO,
  LikeDetailSelect,
} from "@/likes/dto/like-detail.dto";

import { NotificationTriggerService } from "@/notifications/notification-trigger.service";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

type FindLikesParams = {
  take?: number;
  orderBy?: ChronologicalOrder;
  postId?: number;
  userId?: number;
};

@Injectable()
export class LikesService {
  private readonly logger = new Logger(LikesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly notificationTrigger: NotificationTriggerService,
  ) {}

  async findLikes(params?: FindLikesParams): Promise<LikeDetailDTO[]> {
    const take = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    const postId = params?.postId;
    const userId = params?.userId === 0 ? undefined : params?.userId;

    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;

    const v = await this.cacheHelper.getVersion("v:likes:list");

    const cacheKey = `likes:list:v${v}:${take}:p${postId ?? "all"}:u${userId ?? "all"}:order=${orderby}`;

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

    let like: LikeDetailDTO;

    try {
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

          data: {
            likesCount: { increment: 1 },
          },

          select: { id: true },
        }),
      ]);
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          throw new ConflictException("You already liked this post");
        }

        if (err.code === "P2003" || err.code === "P2025") {
          throw new NotFoundException("Post not found");
        }
      }

      throw err;
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after creating like for post ${postId}`,
      async () => {
        await this.cacheHelper.bumpVersion("v:likes:list");
        await this.cacheHelper.del(`posts:detail:${postId}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          `v:user:${post.authorId}:posts:list`,
        );
      },
    );

    await runBestEffort(
      this.logger,
      "error",
      `Failed to create like notification for post ${postId}`,
      async () => {
        await this.notificationTrigger.notifyPostLiked({
          recipientId: post.authorId,
          actorId: currentUserId,
          actorUsername: currentUser.username,
          postId,
        });
      },
    );

    return like;
  }

  async deleteLike(
    id: number,
    currentUserId: number,
  ): Promise<MessageResponse> {
    const like = await this.prisma.like.findUnique({
      where: { id },

      select: {
        id: true,
        userId: true,
        postId: true,
        post: {
          select: {
            authorId: true,
          },
        },
      },
    });

    if (!like) throw new NotFoundException("Like not found");

    if (like.userId !== currentUserId) {
      throw new ForbiddenException(
        "You do not have permission to delete this like",
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.like.delete({ where: { id: like.id } });

        await tx.post.update({
          where: { id: like.postId },

          data: {
            likesCount: { decrement: 1 },
          },

          select: { id: true },
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        throw new NotFoundException("Like or post not found");
      }

      throw err;
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after deleting like ${id}`,
      async () => {
        await this.cacheHelper.del(`like:detail:${id}`);
        await this.cacheHelper.bumpVersion("v:likes:list");
        await this.cacheHelper.del(`posts:detail:${like.postId}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          `v:user:${like.post.authorId}:posts:list`,
        );
      },
    );

    return {
      message: "Like deleted successfully",
    };
  }
}
