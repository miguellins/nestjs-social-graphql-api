import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { runBestEffort } from "@/common/errors/run-best-effort";
import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { type CursorPageResult } from "@/common/pagination/cursor-pagination";

import { type SafePostDetailDTO } from "@/posts/dto/safe-post-detail.dto";
import { type CreatedPostDTO } from "@/posts/dto/created-post.dto";
import { type SafePostListDTO } from "@/posts/dto/safe-post-list.dto";
import { type HomeFeedItemDTO } from "@/posts/dto/home-feed-item.dto";
import { FeedReadService } from "@/posts/feed-read.service";
import { PostListReadService } from "@/posts/post-list-read.service";
import { PostModerationService } from "@/posts/post-moderation.service";
import { PostReadService } from "@/posts/post-read.service";
import { PostWriteService } from "@/posts/post-write.service";
import {
  type CreatePostCommand,
  type UpdatePostCommand,
} from "@/posts/schemas/post-write.schema";
import { type RemovePostByModeratorCommand } from "@/posts/schemas/remove-post-by-moderator.schema";

import { AccountState } from "@/users/enums/account-state.enum";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

type PaginationParams = {
  after?: string;
  first?: number;
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
    private readonly feedReadService: FeedReadService,
    private readonly postListReadService: PostListReadService,
    private readonly postReadService: PostReadService,
    private readonly postWriteService: PostWriteService,
    private readonly postModerationService: PostModerationService,
  ) {}

  /** Delegates the authenticated feed read after preserving active-account gating. */
  async myFeed(
    currentUserId: number,
    params?: PaginationParams,
  ): Promise<CursorPageResult<SafePostListDTO>> {
    await this.assertActiveCurrentUserById(currentUserId);
    return this.postReadService.getMyFeed(currentUserId, params);
  }

  /** Delegates public and viewer-sensitive post list reads to the list collaborator. */
  async findPosts(
    params?: FindPostsParams,
    viewer?: AuthenticatedUser,
  ): Promise<CursorPageResult<SafePostListDTO>> {
    return this.postListReadService.findPosts(params, viewer);
  }

  /** Delegates username post list reads to the list collaborator. */
  async findPostsByUsername(
    username: string,
    params?: PaginationParams,
    viewer?: AuthenticatedUser,
  ): Promise<CursorPageResult<SafePostListDTO>> {
    return this.postListReadService.findPostsByUsername(
      username,
      params,
      viewer,
    );
  }

  /** Delegates the home feed read while keeping resolver dependencies on the coordinator. */
  async homeFeed(
    currentUserId: number,
    params?: PaginationParams,
  ): Promise<CursorPageResult<HomeFeedItemDTO>> {
    return this.feedReadService.getHomeFeed(currentUserId, params);
  }

  /** Returns one post detail and keeps anonymous view-count orchestration on the facade. */
  async getPost(
    id: number,
    viewer?: AuthenticatedUser,
  ): Promise<SafePostDetailDTO> {
    if (viewer?.id) {
      await this.assertActiveCurrentUserById(viewer.id);
    }

    if (viewer?.id) {
      return this.postReadService.getPostDetail(id, viewer.id);
    }

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
        await this.incrementPostViewsCount(
          id,
          cacheKey,
          POST_DETAIL_CACHE_TTL_MS,
        );
      },
    );

    return post;
  }

  /** Delegates post creation to the write collaborator. */
  async createPost(
    input: CreatePostCommand,
    currentUserId: number,
  ): Promise<CreatedPostDTO> {
    return this.postWriteService.createPost(input, currentUserId);
  }

  /** Delegates post updates to the write collaborator. */
  async updatePost(
    id: number,
    input: UpdatePostCommand,
    currentUserId: number,
  ): Promise<SafePostListDTO> {
    return this.postWriteService.updatePost(id, input, currentUserId);
  }

  /** Delegates post deletion to the write collaborator. */
  async deletePost(
    id: number,
    currentUserId: number,
  ): Promise<MessageResponse> {
    return this.postWriteService.deletePost(id, currentUserId);
  }

  /** Delegates moderator post removal to the moderation collaborator. */
  async removePostByModerator(
    input: RemovePostByModeratorCommand,
    currentUser: AuthenticatedUser,
  ): Promise<MessageResponse> {
    return this.postModerationService.removePostByModerator(input, currentUser);
  }

  /** Increments the persisted view counter and refreshes the cached detail when present. */
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
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        return;
      }

      throw err;
    }

    const cachedPost = await this.cacheHelper.get<SafePostDetailDTO>(cacheKey);

    if (!cachedPost) {
      return;
    }

    await this.cacheHelper.set(
      cacheKey,
      {
        ...cachedPost,
        viewsCount: updatedPost.viewsCount,
      },
      detailCacheTtlMs,
    );
  }

  /** Ensures authenticated post operations cannot be performed by disabled accounts. */
  private async assertActiveCurrentUserById(
    currentUserId: number,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        accountState: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Current user not found");
    }

    if (user.accountState === AccountState.SUSPENDED) {
      throw new ForbiddenException("This account is suspended");
    }

    if (user.accountState === AccountState.DEACTIVATED) {
      throw new NotFoundException("Current user not found");
    }
  }
}
