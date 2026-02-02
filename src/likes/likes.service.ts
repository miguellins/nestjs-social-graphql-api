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
        post: true,
      },
    });
  }

  async getLike(id: number) {
    const like = await this.prisma.like.findUnique({
      where: { id },
      include: {
        user: true,
        post: true,
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

  /*
  async updatePost(
    id: number,
    input: {
      title?: string;
      content?: string;
    },
  ) {
    const post = await this.prisma.post.findUnique({
      where: { id },
    });

    if (!post) throw new NotFoundException("Post not found");

    const data: any = {};

    if (!input.title !== undefined) data.title = input.title;
    if (!input.content !== undefined) data.content = input.content;

    try {
      return await this.prisma.post.update({
        where: { id },
        data,
        include: {
          author: true,
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
        throw new ConflictException(`User with this ${fields} already exists`);
      }

      throw new InternalServerErrorException("Failed to update user");
    }
  }

  async deletePost(id: number) {
    const post = await this.prisma.post.findUnique({
      where: { id },
    });

    if (!post) throw new NotFoundException("Post not found");

    return this.prisma.post.delete({
      where: { id },
    });
  }
    */
}
