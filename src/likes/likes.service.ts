import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "src/prisma.service";

import { Prisma } from "@prisma/client";
import { Like } from "./likes.model";

@Injectable()
export class LikesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllLikes() {
    return this.prisma.like.findMany({
      include: {
        user: true,
        post: {
          include: {
            author: true,
          },
        },
      },
    });
  }

  async getLike(id: number) {
    const like = await this.prisma.like.findUnique({
      where: { id },
      include: {
        user: true,
        post: { include: { author: true } },
      },
    });

    if (!like) throw new NotFoundException("Like not found");

    return like;
  }

  async createLike(currentUserId: number, postId: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!post) throw new NotFoundException("Post not found");

    try {
      const [like] = await this.prisma.$transaction([
        this.prisma.like.create({
          data: {
            userId: currentUserId,
            postId,
          },
        }),

        this.prisma.post.update({
          where: {
            id: postId,
          },
          data: {
            likesCount: {
              increment: 1,
            },
          },
        }),
      ]);

      return like;
    } catch (err) {
      // if user already liked the post (because of @@unique([userId, postId]))
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException("You already liked this post");
      }
      throw err;
    }
  }

  async deleteLike(id: number, currentUserId: number) {
    const like = await this.prisma.like.findUnique({
      where: { id },
    });

    if (!like) throw new NotFoundException("Like not found");

    if (like.userId !== currentUserId)
      throw new ForbiddenException(
        "You do not have permission to delete this like",
      );

    const [, deletedLike] = await this.prisma.$transaction([
      this.prisma.post.update({
        where: { id: like.postId },
        data: {
          likesCount: {
            decrement: 1,
          },
        },
      }),

      this.prisma.like.delete({
        where: { id },
      }),
    ]);

    return deletedLike;
  }
}
