import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";

import { DeleteResponse } from "@/common/types/delete-response.type";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";

import {
  SafePostDetailDTO,
  SafePostDetailSelect,
} from "@/posts/dto/safe-post-detail.dto";
import {
  SafePostListDTO,
  SafePostListSelect,
} from "@/posts/dto/safe-post-list.dto";

import { CreatePostInput } from "@/posts/dto/create-post.input";
import { UpdatePostInput } from "@/posts/dto/update-post.input";

import { PrismaService } from "@/prisma.service";
import { Prisma } from "@prisma/client";

type PaginationParams = {
  take?: number;
  orderBy?: ChronologicalOrder;
};

type FindPostsParams = PaginationParams & {
  q?: string;
};

/**
 * Responsible for business logic and data operations
 */

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
  ) {}

  async myFeed(
    currentUserId: number,
    params?: PaginationParams,
  ): Promise<SafePostListDTO[]> {
    const take = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    // Default to newest-first when no explicit chronological order is provided
    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;

    return this.prisma.post.findMany({
      where: {
        OR: [
          // Include posts created by the current user
          { authorId: currentUserId },

          // Include posts from users the current user follows
          {
            author: {
              followers: {
                some: {
                  followerId: currentUserId,
                },
              },
            },
          },
        ],
      },

      // Show newest posts first
      orderBy: {
        createdAt: toSortDirection(orderby),
      },

      take,

      select: SafePostListSelect,
    });
  }

  async findPosts(params?: FindPostsParams): Promise<SafePostListDTO[]> {
    // Ensures the value never exceeds MAX_TAKE (number of records per request)
    const take = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    // Optional search
    const search = params?.q?.trim().toLowerCase() || undefined;

    // Default to newest-first when no explicit chronological order is provided
    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;

    const v = await this.cacheHelper.getVersion("v:posts:list");
    const cacheKey = `posts:list:v${v}:${take}:${search ?? "all"}:order=${orderby}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
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

          orderBy: {
            createdAt: toSortDirection(orderby),
          },

          select: SafePostListSelect,
        });
      },
      30_000,
    );
  }

  async getPost(id: number): Promise<SafePostDetailDTO> {
    const cacheKey = `posts:detail:${id}`;

    // Determines the final limit safely
    // Ensures the value never exceeds the likes hard cap
    const likesTake = Math.min(
      PAGINATION.DEFAULT_TAKE_LIKES,
      PAGINATION.MAX_TAKE_LIKES,
    );

    let updatedViewCount: number;

    try {
      // Increment viewsCount on every successful detail request
      const updatedPost = await this.prisma.post.update({
        where: { id },

        data: {
          viewsCount: {
            increment: 1,
          },
        },

        select: {
          viewsCount: true,
        },
      });

      updatedViewCount = updatedPost.viewsCount;
    } catch {
      throw new NotFoundException("Post not found");
    }

    const post = await this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const postDetail = await this.prisma.post.findUnique({
          where: { id },

          select: {
            ...SafePostDetailSelect,

            likes: {
              take: likesTake,

              orderBy: {
                createdAt: "desc",
              },

              select: SafePostDetailSelect.likes.select,
            },
          },
        });

        if (!postDetail) throw new NotFoundException("Post not found");

        return postDetail;
      },
      60_000, // Detail cache TTL
    );

    // Never trust cached viewsCount here
    // Always return the latest value after the increment above
    return {
      ...post,
      viewsCount: updatedViewCount,
    };
  }

  async createPost(
    input: CreatePostInput,
    currentUserId: number,
  ): Promise<SafePostListDTO> {
    // Normalize inputs
    const title = input.title?.trim();
    const content = input.content?.trim();

    // Validates
    if (!title) throw new BadRequestException("Title cannot be empty");
    if (!content) throw new BadRequestException("Content cannot be empty");

    try {
      const post = await this.prisma.post.create({
        data: {
          title,
          content,
          author: { connect: { id: currentUserId } },
        },

        select: SafePostListSelect,
      });

      await this.cacheHelper.bumpVersion("v:posts:list");

      await this.cacheHelper.del(`user:safe:${currentUserId}`);
      await this.cacheHelper.bumpVersion("v:user:list");

      return post;
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

  async updatePost(
    id: number,
    input: UpdatePostInput,
    currentUserId: number,
  ): Promise<SafePostListDTO> {
    // Require at least one field
    const hasAnyField =
      input.title !== undefined || input.content !== undefined;

    if (!hasAnyField) {
      throw new BadRequestException("No fields provided to update");
    }

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

      if (existing.authorId !== currentUserId) {
        throw new ForbiddenException(
          "You do not have permission to update this post",
        );
      }

      const post = await this.prisma.post.update({
        where: { id },
        data,

        select: SafePostListSelect,
      });

      // Invalidate / bump only the caches affected by this write
      await this.cacheHelper.del(`posts:detail:${id}`);
      await this.cacheHelper.bumpVersion("v:posts:list");

      return post;
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof ForbiddenException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }

      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") throw new NotFoundException("Post not found");
      }

      throw new InternalServerErrorException("Failed to update post");
    }
  }

  async deletePost(id: number, currentUserId: number): Promise<DeleteResponse> {
    try {
      // Check existence and ownership
      const existing = await this.prisma.post.findUnique({
        where: { id },
        select: { id: true, authorId: true },
      });

      if (!existing) throw new NotFoundException("Post not found");

      if (existing.authorId !== currentUserId) {
        throw new ForbiddenException(
          "You do not have permission to delete this post",
        );
      }

      await this.prisma.post.delete({
        where: { id },
      });

      // Invalidate / bump only the caches affected by this write
      await this.cacheHelper.del(`posts:detail:${id}`);
      await this.cacheHelper.bumpVersion("v:posts:list");

      return {
        message: "Post deleted successfully",
      };
    } catch (err) {
      // If someone deleted it between the check and the delete
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        throw new NotFoundException("Post not found");
      }

      // Keep intentional domain errors
      if (
        err instanceof NotFoundException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }

      throw new InternalServerErrorException("Failed to delete post");
    }
  }
}
