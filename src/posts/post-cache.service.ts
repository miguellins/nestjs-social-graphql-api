import { Injectable, Logger } from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { runBestEffort } from "@/common/errors/run-best-effort";

@Injectable()
export class PostCacheService {
  private readonly logger = new Logger(PostCacheService.name);

  constructor(private readonly cacheHelper: CacheHelperService) {}

  /** Invalidates list, author, hashtag, and user caches after post creation. */
  async invalidateAfterCreatePost(
    postId: number,
    authorId: number,
    publicHashtagCountChanged: boolean,
  ): Promise<void> {
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after creating post ${postId}`,
      async () => {
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          this.getUserPostsListVersionKey(authorId),
        );
        if (publicHashtagCountChanged) {
          await this.cacheHelper.bumpVersion("v:hashtags:list");
        }
        await this.cacheHelper.del(`user:safe:${authorId}`);
        await this.cacheHelper.bumpVersion("v:user:list");
      },
    );
  }

  /** Invalidates detail, list, author, and hashtag caches after post updates. */
  async invalidateAfterUpdatePost(
    postId: number,
    authorId: number,
    publicHashtagCountChanged: boolean,
  ): Promise<void> {
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after updating post ${postId}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${postId}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          this.getUserPostsListVersionKey(authorId),
        );
        if (publicHashtagCountChanged) {
          await this.cacheHelper.bumpVersion("v:hashtags:list");
        }
      },
    );
  }

  /** Invalidates detail, list, author, and hashtag caches after post deletion. */
  async invalidateAfterDeletePost(
    postId: number,
    authorId: number,
    publicHashtagCountChanged: boolean,
  ): Promise<void> {
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after deleting post ${postId}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${postId}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          this.getUserPostsListVersionKey(authorId),
        );
        if (publicHashtagCountChanged) {
          await this.cacheHelper.bumpVersion("v:hashtags:list");
        }
      },
    );
  }

  /** Invalidates detail, list, author, and hashtag caches after moderator removal. */
  async invalidateAfterModeratorRemovePost(
    postId: number,
    authorId: number,
    publicHashtagCountChanged: boolean,
  ): Promise<void> {
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after moderator removed post ${postId}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${postId}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          this.getUserPostsListVersionKey(authorId),
        );
        if (publicHashtagCountChanged) {
          await this.cacheHelper.bumpVersion("v:hashtags:list");
        }
      },
    );
  }

  /** Invalidates root-source and author list caches after repost counter changes. */
  async invalidateAfterRepostChange(
    sourcePostId: number,
    repostAuthorId: number,
    sourceAuthorId: number,
    repostPostId?: number,
  ): Promise<void> {
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after repost change for source post ${sourcePostId}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${sourcePostId}`);
        if (repostPostId !== undefined) {
          await this.cacheHelper.del(`posts:detail:${repostPostId}`);
        }
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion("v:reposts:list");
        await this.cacheHelper.bumpVersion(
          `v:user:${repostAuthorId}:reposts:list`,
        );
        await this.cacheHelper.bumpVersion(
          this.getUserPostsListVersionKey(repostAuthorId),
        );
        await this.cacheHelper.bumpVersion(
          this.getUserPostsListVersionKey(sourceAuthorId),
        );
      },
    );
  }

  /** Returns the cache version key string for a user post list. */
  private getUserPostsListVersionKey(userId: number): string {
    return `v:user:${userId}:posts:list`;
  }
}
