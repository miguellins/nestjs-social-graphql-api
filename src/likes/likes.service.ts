import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "src/prisma.service";

import { Prisma } from "@prisma/client";

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

  async createLike(input: { userId: number; postId: number }) {
    const like = await this.prisma.like.findUnique({
      where: { userId_postId: { userId: input.userId, postId: input.postId } },
    });

    if (like) throw new ConflictException("User already liked this post");

    return this.prisma.like.create({ data: input });
  }

  async updateLike(
    id: number,
    input: {
      userId?: number;
      postId?: number;
    },
  ) {
    const like = await this.prisma.like.findUnique({
      where: { id },
    });

    if (!like) throw new NotFoundException("Like not found");

    const data: any = {};

    if (!input.userId !== undefined) data.userId = input.userId;
    if (!input.postId !== undefined) data.postId = input.postId;

    try {
      return await this.prisma.like.update({
        where: { id },
        data,
        include: {
          user: true,
          post: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const fields =
          (err.meta?.target as string[] | undefined)?.join(", ") ??
          "unique field";
        throw new ConflictException(`Like with this ${fields} already exists`);
      }

      throw new InternalServerErrorException("Failed to update like");
    }
  }

  async deleteLike(id: number) {
    const like = await this.prisma.like.findUnique({
      where: { id },
    });

    if (!like) throw new NotFoundException("Like not found");

    return this.prisma.like.delete({
      where: { id },
    });
  }
}
