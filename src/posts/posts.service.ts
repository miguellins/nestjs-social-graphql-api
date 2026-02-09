import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException
} from "@nestjs/common";

import { PrismaService } from "src/prisma.service";

import { Post, Prisma } from "@prisma/client";

import { __InputValue } from "graphql";
import { CreatePostInput } from "./dto/create-post.input";
import { UpdatePostInput } from "./dto/update-post.input";

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) { }

  async getAllPosts() {
    return this.prisma.post.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        author: true,
        likes: {
          orderBy: { createdAt: "desc" },
          include: { user: true },
        },
      },
    });
  }

  async getPost(id: number) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: true,
        likes: {
          orderBy: { createdAt: "desc" },
          include: { user: true }
        },
      },
    });

    if (!post) throw new NotFoundException("Post not found");

    return post;
  }

  async createPost(
    input: CreatePostInput,
    currentUserId: number,
  ) {
    return this.prisma.post.create({
      data: {
        title: input.title.trim(),
        content: input.content.trim(),
        author: {
          connect: { id: currentUserId }, // ⭐ safer than raw FK
        },
      },
      include: {
        author: true,
      },
    });
  }

  async updatePost(
    id: number,
    input: UpdatePostInput,
    currentUserId: number,
  ) {
    const hasAnyField = input.title !== undefined || input.content !== undefined;

    if (!hasAnyField) throw new BadRequestException("No fields provided to update");

    const data: Prisma.PostUpdateInput = {};

    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new BadRequestException("Title cannot be empty");
      data.title = title;
    }

    if (input.content !== undefined) {
      const content = input.content.trim();
      if (!content) throw new BadRequestException("Content cannot be empty");
      data.content = content;
    }

    return await this.prisma.post.update({
      where: { id, authorId: currentUserId },
      data,
    });
  }

  async deletePost(id: number, currentUserId: number) {
    try {
      const result = await this.prisma.post.deleteMany({
        where: {
          id,
          authorId: currentUserId,
        },
      });

      if (result.count === 0)
        throw new ForbiddenException(
          "You do not have permission to delete this post",
        );

      return {
        message: "Post deleted successfully",
      };
    } catch (err) {
      throw new InternalServerErrorException("Failed to delete post");
    }
  }
}
