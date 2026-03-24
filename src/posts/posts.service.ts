import {
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "@/prisma.service";
import { Prisma } from "@prisma/client";

import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";

import {
  createPostCommandSchema,
  updatePostCommandSchema,
} from "@/posts/schemas/post-write.schema";
import type {
  CreatePostCommand,
  UpdatePostCommand,
} from "@/posts/schemas/post-write.schema";
import type { SafePostDetailDTO } from "@/posts/dto/safe-post-detail.dto";
import { SafePostDetailSelect } from "@/posts/dto/safe-post-detail.dto";
import type { SafePostListDTO } from "@/posts/dto/safe-post-list.dto";
import { SafePostListSelect } from "@/posts/dto/safe-post-list.dto";

/**
 * Service for post workflows
 *
 * Creates, lists, updates, and deletes posts
 */

type PaginationParams = {
  take?: number;
  orderBy?: ChronologicalOrder;
};

type FindPostsParams = PaginationParams & {
  q?: string;
};

const POST_DETAIL_CACHE_TTL_MS = 60_000;

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  // Injects the services used by post workflows
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
  ) {}

  // Returns the feed for the current user and followed authors
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

  // Lists posts with optional search and bounded pagination
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

  // Returns a post detail view and increments its view counter
  async getPost(id: number): Promise<SafePostDetailDTO> {
    const cacheKey = `posts:detail:${id}`;

    // Determines the final limit safely
    // Ensures the value never exceeds the likes hard cap
    const likesTake = Math.min(
      PAGINATION.DEFAULT_TAKE_LIKES,
      PAGINATION.MAX_TAKE_LIKES,
    );

    // Clamp number of comments returned to the allowed pagination bounds
    const commentsTake = Math.min(PAGINATION.DEFAULT_TAKE, PAGINATION.MAX_TAKE);

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

            comments: {
              take: commentsTake,

              orderBy: {
                createdAt: "desc",
              },

              select: SafePostDetailSelect.comments.select,
            },
          },
        });

        if (!postDetail) throw new NotFoundException("Post not found");

        return postDetail;
      },
      POST_DETAIL_CACHE_TTL_MS,
    );

    // Keep hot reads cache-friendly and move view tracking into a non-blocking follow-up
    void runBestEffort(
      this.logger,
      "warn",
      `Failed to update viewsCount asynchronously for post ${id}`,
      async () => {
        await this.incrementPostViewsCount(
          id,
          cacheKey,
          POST_DETAIL_CACHE_TTL_MS,
        );
      },
    );

    return post;
  }

  // Creates a new post for the current user
  async createPost(
    input: CreatePostCommand,
    currentUserId: number,
  ): Promise<SafePostListDTO> {
    const data = this.parseCreatePostInput(input);

    // Store the created post outside the try block so follow-up cache work can reuse it
    let post: SafePostListDTO;

    try {
      const createData: Prisma.PostCreateInput = {
        content: data.content,
        author: { connect: { id: currentUserId } },
      };

      if (data.title !== undefined) {
        createData.title = data.title;
      }

      post = await this.prisma.post.create({
        data: createData,

        select: SafePostListSelect,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Translate missing author references into the local domain error for this workflow.
        if (err.code === "P2003" || err.code === "P2025") {
          throw new NotFoundException("Author not found");
        }
      }

      this.throwUnexpectedPersistenceFailure("create post", err);
    }

    // Keep cache refresh failures from masking a committed post creation
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after creating post ${post.id}`,
      async () => {
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.del(`user:safe:${currentUserId}`);
        await this.cacheHelper.bumpVersion("v:user:list");
      },
    );

    return post;
  }

  // Updates a post owned by the current user
  async updatePost(
    id: number,
    input: UpdatePostCommand,
    currentUserId: number,
  ): Promise<SafePostListDTO> {
    const normalizedInput = this.parseUpdatePostInput(input);

    // Build update payload safely
    const data: Prisma.PostUpdateInput = {};

    if (normalizedInput.title !== undefined) {
      data.title = normalizedInput.title;
    }

    if (normalizedInput.content !== undefined) {
      data.content = normalizedInput.content;
    }

    // Store the updated post outside the try block so follow-up cache work can reuse it
    let post: SafePostListDTO;

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

      post = await this.prisma.post.update({
        where: { id },
        data,

        select: SafePostListSelect,
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;

      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Preserve the not-found domain response for update races
        if (err.code === "P2025") throw new NotFoundException("Post not found");
      }

      this.throwUnexpectedPersistenceFailure("update post", err);
    }

    // Keep cache refresh failures from masking a committed post update
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after updating post ${id}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${id}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
      },
    );

    return post;
  }

  // Deletes a post owned by the current user
  async deletePost(
    id: number,
    currentUserId: number,
  ): Promise<MessageResponse> {
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
    } catch (err) {
      if (err instanceof HttpException) throw err;

      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        // Preserve the not-found domain response for delete races
        throw new NotFoundException("Post not found");
      }

      this.throwUnexpectedPersistenceFailure("delete post", err);
    }

    // Keep cache refresh failures from masking a committed post deletion
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after deleting post ${id}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${id}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
      },
    );

    return {
      message: "Post deleted successfully",
    };
  }

  // Parses and normalizes create-post input for the service layer
  private parseCreatePostInput(input: CreatePostCommand) {
    return parseWithBadRequest(
      createPostCommandSchema,
      input,
      "Invalid post input",
    );
  }

  // Parses and normalizes update-post input for the service layer
  private parseUpdatePostInput(input: UpdatePostCommand) {
    return parseWithBadRequest(
      updatePostCommandSchema,
      input,
      "Invalid post input",
    );
  }

  private throwUnexpectedPersistenceFailure(
    action: "create post" | "update post" | "delete post",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  private async incrementPostViewsCount(
    id: number,
    cacheKey: string,
    detailCacheTtlMs: number,
  ): Promise<void> {
    let updatedPost: { viewsCount: number };

    try {
      updatedPost = await this.prisma.post.update({
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
    } catch (err) {
      // The detail response already succeeded, so a concurrent delete should not surface as a read failure.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        return;
      }

      throw err;
    }

    const cachedPost = await this.cacheHelper.get<SafePostDetailDTO>(cacheKey);

    if (!cachedPost) return;

    await this.cacheHelper.set(
      cacheKey,
      {
        ...cachedPost,
        viewsCount: updatedPost.viewsCount,
      },
      detailCacheTtlMs,
    );
  }
}
