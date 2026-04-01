import {
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";

import { type SafePostDetailDTO } from "@/posts/dto/safe-post-detail.dto";
import { PostReadService } from "@/posts/post-read.service";
import {
  createPostCommandSchema,
  updatePostCommandSchema,
  type CreatePostCommand,
  type UpdatePostCommand,
} from "@/posts/schemas/post-write.schema";
import {
  type SafePostListDTO,
  SafePostListSelect,
} from "@/posts/dto/safe-post-list.dto";

import {
  getUserByUsernameCommandSchema,
  type GetUserByUsernameCommand,
} from "@/users/schemas/user-read.schema";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly postReadService: PostReadService,
  ) {}

  async myFeed(
    currentUserId: number,
    params?: PaginationParams,
  ): Promise<SafePostListDTO[]> {
    const take = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

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

      orderBy: {
        createdAt: toSortDirection(orderby),
      },

      take,
      select: SafePostListSelect,
    });
  }

  async findPosts(params?: FindPostsParams): Promise<SafePostListDTO[]> {
    const take = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    const search = params?.q?.trim().toLowerCase() || undefined;

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

  async findPostsByUsername(
    username: string,
    params?: PaginationParams,
  ): Promise<SafePostListDTO[]> {
    const normalized = this.parseGetUserByUsernameInput({ username });

    const take = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;

    const authorId = await this.getUserIdByUsername(normalized.username);

    const versionKey = this.getUserPostsListVersionKey(authorId);
    const v = await this.cacheHelper.getVersion(versionKey);
    const cacheKey = `user:${authorId}:posts:list:v${v}:take=${take}:order=${orderby}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        return this.prisma.post.findMany({
          take,

          where: {
            authorId,
          },

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

    const post = await this.cacheHelper.getOrSet(
      cacheKey,
      async () => this.postReadService.getPostDetail(id),
      POST_DETAIL_CACHE_TTL_MS,
    );

    void runBestEffort(
      this.logger,
      "warn",
      `Failed to update viewsCount asynchronously for post ${id}`,
      async () => {
        await this.postReadService.incrementPostViewsCount(
          id,
          cacheKey,
          POST_DETAIL_CACHE_TTL_MS,
        );
      },
    );

    return post;
  }

  async createPost(
    input: CreatePostCommand,
    currentUserId: number,
  ): Promise<SafePostListDTO> {
    const data = this.parseCreatePostInput(input);

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
        if (err.code === "P2003" || err.code === "P2025") {
          throw new NotFoundException("Author not found");
        }
      }

      this.throwUnexpectedPersistenceFailure("create post", err);
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after creating post ${post.id}`,
      async () => {
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          this.getUserPostsListVersionKey(currentUserId),
        );
        await this.cacheHelper.del(`user:safe:${currentUserId}`);
        await this.cacheHelper.bumpVersion("v:user:list");
      },
    );

    return post;
  }

  async updatePost(
    id: number,
    input: UpdatePostCommand,
    currentUserId: number,
  ): Promise<SafePostListDTO> {
    const normalizedInput = this.parseUpdatePostInput(input);

    const data: Prisma.PostUpdateInput = {};

    if (normalizedInput.title !== undefined) {
      data.title = normalizedInput.title;
    }

    if (normalizedInput.content !== undefined) {
      data.content = normalizedInput.content;
    }

    let post: SafePostListDTO;

    try {
      const existing = await this.prisma.post.findUnique({
        where: { id },

        select: {
          id: true,
          authorId: true,
          title: true,
          content: true,
        },
      });

      if (!existing) throw new NotFoundException("Post not found");

      if (existing.authorId !== currentUserId) {
        throw new ForbiddenException(
          "You do not have permission to update this post",
        );
      }

      if (this.didPostContentChange(existing, normalizedInput)) {
        data.editedAt = new Date();
      }

      post = await this.prisma.post.update({
        where: { id },
        data,

        select: SafePostListSelect,
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;

      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") throw new NotFoundException("Post not found");
      }

      this.throwUnexpectedPersistenceFailure("update post", err);
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after updating post ${id}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${id}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          this.getUserPostsListVersionKey(currentUserId),
        );
      },
    );

    return post;
  }

  async deletePost(
    id: number,
    currentUserId: number,
  ): Promise<MessageResponse> {
    try {
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
        throw new NotFoundException("Post not found");
      }

      this.throwUnexpectedPersistenceFailure("delete post", err);
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after deleting post ${id}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${id}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          this.getUserPostsListVersionKey(currentUserId),
        );
      },
    );

    return {
      message: "Post deleted successfully",
    };
  }

  // Private Helpers
  // Parses and normalizes create-post input
  private parseCreatePostInput(input: CreatePostCommand) {
    return parseWithBadRequest(
      createPostCommandSchema,
      input,
      "Invalid post input",
    );
  }

  // Parses and normalizes update-post input
  private parseUpdatePostInput(input: UpdatePostCommand) {
    return parseWithBadRequest(
      updatePostCommandSchema,
      input,
      "Invalid post input",
    );
  }

  // Parses and normalizes public username lookup input
  private parseGetUserByUsernameInput(input: GetUserByUsernameCommand) {
    return parseWithBadRequest(
      getUserByUsernameCommandSchema,
      input,
      "Invalid post author lookup input",
    );
  }

  // Retrieves the user ID for the given username, using cache for performance
  private async getUserIdByUsername(username: string): Promise<number> {
    const lookupCacheKey = this.getUserUsernameLookupCacheKey(username);
    const cachedId = await this.cacheHelper.get<number>(lookupCacheKey);

    if (cachedId !== undefined) {
      return cachedId;
    }

    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException(`User with username "${username}" not found`);
    }

    await this.cacheHelper.set(lookupCacheKey, user.id, 5 * 60_000);

    return user.id;
  }

  // Returns the cache key string for user lookup by username
  private getUserUsernameLookupCacheKey(username: string): string {
    return `user:lookup:username:${username}`;
  }

  // Returns the cache version key string for a user's post list
  private getUserPostsListVersionKey(userId: number): string {
    return `v:user:${userId}:posts:list`;
  }

  // Determines if the provided input would result in a content change for a given post
  private didPostContentChange(
    existing: {
      title: string | null;
      content: string;
    },
    input: UpdatePostCommand,
  ): boolean {
    return (
      (input.title !== undefined && input.title !== existing.title) ||
      (input.content !== undefined && input.content !== existing.content)
    );
  }

  // Logs and throws an internal server error for unexpected persistence failures
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
}
