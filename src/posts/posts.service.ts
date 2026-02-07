import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "src/prisma.service";

import { Prisma } from "@prisma/client";
import { __InputValue } from "graphql";

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) { }

  async getAllPosts() {
    return this.prisma.post.findMany({
      include: {
        author: true,
        likes: { include: { user: true } },
      },
    });
  }

  async getPost(id: number) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: true,
        likes: { include: { user: true } },
      },
    });

    if (!post) throw new NotFoundException("Post not found");

    return post;
  }

  async createPost(
    input: {
      title: string;
      content: string;
    },
    currentUserId: number,
  ) {
    return this.prisma.post.create({
      data: {
        title: input.title,
        content: input.content,
        authorId: currentUserId,
      },
      include: {
        author: true,
      },
    });
  }

  async updatePost(
    id: number,
    input: {
      title?: string;
      content?: string;
    },
    currentUserId: number,
  ) {
    const data: Prisma.PostUpdateInput = {};

    if (input.title !== undefined) data.title = input.title;
    if (input.content !== undefined) data.content = input.content;

    try {
      const result = await this.prisma.post.updateMany({
        where: {
          id,
          authorId: currentUserId,
        },
        data,
      });

      if (result.count === 0)
        throw new ForbiddenException(
          "You do not have permission to update this post",
        );

      return this.prisma.post.findUniqueOrThrow({
        where: { id },
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

        throw new ConflictException(`Post with this ${fields} already exists`);
      }

      throw new InternalServerErrorException("Failed to update post");
    }
  }

  async deletePost(id: number, currentUserId: number) {
    try {
      const result = await this.prisma.post.deleteMany({
        where: {
          id,
          authorId: currentUserId,
        },
      });

      if (result.count === 0) {
        throw new ForbiddenException(
          "You do not have permission to delete this post",
        );
      }

      return {
        message: "Post deleted successfully",
      };
    } catch (err) {
      throw new InternalServerErrorException("Failed to delete post");
    }
  }
}
