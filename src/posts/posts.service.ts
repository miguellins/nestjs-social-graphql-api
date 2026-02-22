import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";

import { PAGINATION } from "src/common/constants/hard-cap.constants";

import { FindPostsArgs } from "src/common/args/find-posts-args";

import {
  SafePostCreateDTO,
  SafePostCreateSelect,
} from "./dto/safe-post-create.dto";
import {
  SafePostDetailDTO,
  SafePostDetailSelect,
} from "./dto/safe-post-detail";

import { SafePostListDTO, SafePostListSelect } from "./dto/safe-post-list.dto";

import { CreatePostInput } from "./dto/create-post.input";
import { UpdatePostInput } from "./dto/update-post.input";

import { PrismaService } from "src/prisma.service";

import { Prisma } from "@prisma/client";

/**
 * Responsible for business logic and data operations
 */

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async findPosts(params?: FindPostsArgs): Promise<SafePostListDTO[]> {
    // Ensures the value never exceeds MAX_TAKE (number of records per request)
    const take = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    // Optional search
    const q = params?.q?.trim();
    const search = q ? q : undefined;

    const where: Prisma.PostWhereInput | undefined = search
      ? {
          OR: [
            { title: { contains: search } },
            { content: { contains: search } },
          ],
        }
      : undefined;

    return this.prisma.post.findMany({
      take,
      where,

      // Order by newest
      orderBy: {
        createdAt: "desc",
      },

      select: SafePostListSelect,
    });
  }

  async getPost(id: number): Promise<SafePostDetailDTO> {
    // Hard query cap
    // Max number of likes per request
    const MAX_LIKES = 50;

    // Default number of likes returned
    const DEFAULT_LIKES = 20;

    // Determines the final limit safely
    // Ensures the value never exceeds MAX_LIKES (number of likes per request)
    const likesTake = Math.min(DEFAULT_LIKES, MAX_LIKES);

    const post = await this.prisma.post.findUnique({
      where: { id },

      select: {
        ...SafePostDetailSelect,

        likes: {
          take: likesTake,
          orderBy: { createdAt: "desc" },
          select: SafePostDetailSelect.likes.select,
        },
      },
    });

    if (!post) throw new NotFoundException("Post not found");

    return post;
  }

  async createPost(
    input: CreatePostInput,
    currentUserId: number,
  ): Promise<SafePostCreateDTO> {
    // Normalize inputs
    const title = input.title?.trim();
    const content = input.content?.trim();

    // Validates
    if (!title) throw new BadRequestException("Title cannot be empty");
    if (!content) throw new BadRequestException("Content cannot be empty");

    try {
      return await this.prisma.post.create({
        data: {
          title,
          content,
          author: { connect: { id: currentUserId } },
        },

        select: SafePostCreateSelect,
      });
    } catch (err) {
      // Handle known Prisma errors cleanly
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // If author id does not exist / relation failds (common on connect)
        if (err.code === "P2003" || err.code === "P2025") {
          throw new NotFoundException("Author not found");
        }
      }

      throw new InternalServerErrorException("Failed to create post");
    }
  }

  async updatePost(id: number, input: UpdatePostInput, currentUserId: number) {
    // Require at least one field
    const hasAnyField =
      input.title !== undefined || input.content !== undefined;

    if (!hasAnyField)
      throw new BadRequestException("No fields provided to update");

    // Build update payload safely
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

    try {
      // Fetch minimal fields needed for ownership + existence
      const existing = await this.prisma.post.findUnique({
        where: { id },

        select: {
          id: true,
          authorId: true,
        },
      });

      if (!existing) throw new NotFoundException("Post not found");

      if (existing.authorId !== currentUserId)
        throw new ForbiddenException(
          "You do not have permission to update this post",
        );

      // Update and return a safe shape
      return await this.prisma.post.update({
        where: { id },
        data,
        select: {
          id: true,
          title: true,
          content: true,
          createdAt: true,
          updatedAt: true,

          author: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },

          _count: {
            select: {
              likes: true,
            },
          },

          likes: {
            select: {
              id: true,
              createdAt: true,
              user: true,
            },
          },
        },
      });
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof ForbiddenException ||
        err instanceof NotFoundException
      )
        throw err;

      if (err instanceof Prisma.PrismaClientKnownRequestError)
        if (err.code === "P2025") throw new NotFoundException("Post not found");

      throw new InternalServerErrorException("Failed to update post");
    }
  }

  async deletePost(id: number, currentUserId: number) {
    try {
      // Check existence and ownership
      const existing = await this.prisma.post.findUnique({
        where: { id },
        select: { id: true, authorId: true },
      });

      if (!existing) throw new NotFoundException("Post not found");

      if (existing.authorId !== currentUserId)
        throw new ForbiddenException(
          "You do not have permission to delete this post",
        );

      await this.prisma.post.delete({
        where: { id },
      });

      return { message: "Post deleted successfully" };
    } catch (err) {
      // If someone deleted it between the check and the delete
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      )
        throw new NotFoundException("Post not found");

      // Keep intentional domain errors
      if (err instanceof NotFoundException || err instanceof ForbiddenException)
        throw err;

      throw new InternalServerErrorException("Failed to delete post");
    }
  }
}
