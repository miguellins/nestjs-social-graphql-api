import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import { PAGINATION } from "src/common/constants/hard-cap.constants";

import { FindLikesArgs } from "src/common/args/find-likes.args";

import { LikeDetailDTO, LikeDetailSelect } from "./dto/like-detail.dto";

import { PrismaService } from "src/prisma.service";

import { Prisma } from "@prisma/client";

@Injectable()
export class LikesService {
  constructor(private readonly prisma: PrismaService) {}

  async findLikes(params?: FindLikesArgs): Promise<LikeDetailDTO[]> {
    const take = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    const where: Prisma.LikeWhereInput = {
      ...(params?.postId && { postId: params.postId }),
      ...(params?.userId && { userId: params.userId }),
    };

    return this.prisma.like.findMany({
      take,
      where,
      orderBy: { createdAt: "desc" },

      select: LikeDetailSelect,
    });
  }

  async getLike(id: number): Promise<LikeDetailDTO> {
    try {
      const like = await this.prisma.like.findUnique({
        where: { id },

        select: LikeDetailSelect,
      });

      if (!like) throw new NotFoundException("Like not found");

      return like;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;

      throw new InternalServerErrorException("Failed to fetch like");
    }
  }

  async createLike(
    currentUserId: number,
    postId: number,
  ): Promise<LikeDetailDTO> {
    try {
      // Single transaction
      // create like (will fail if post doesnt exist or ir already liked)
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

      return like;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // @@unique([userId, postId]) -> already liked
        if (err.code === "P2002")
          throw new ConflictException("You already liked this post");

        // FK violation: postId doesn't exist (or userId doesn't exist)
        if (err.code === "P2003") throw new NotFoundException("Post not found");

        // Record not found on update (race condition / deleted post)
        if (err.code === "P2025") throw new NotFoundException("Post not found");
      }

      throw new InternalServerErrorException("Failed to create like");
    }
  }

  async deleteLike(id: number, currentUserId: number) {
    try {
      // Validate existence + ownership + post target
      const like = await this.prisma.like.findUnique({
        where: { id },
        select: { id: true, userId: true, postId: true },
      });

      if (!like) throw new NotFoundException("Like not found");

      if (like.userId !== currentUserId)
        throw new ForbiddenException(
          "You do not have permission to delete this like",
        );

      // Delete like + decrement counter safely
      await this.prisma.$transaction(async (tx) => {
        // Delete frist (guarantees only decrement if the like truly exists)
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

      return { message: "Like deleted successfully" };
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
