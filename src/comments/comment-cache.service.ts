import { Injectable, Logger } from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { runBestEffort } from "@/common/errors/run-best-effort";

@Injectable()
export class CommentCacheService {
  private readonly logger = new Logger(CommentCacheService.name);

  constructor(private readonly cacheHelper: CacheHelperService) {}

  /** Invalidates post detail and list caches after creating a comment. */
  async invalidateAfterCreateComment(
    postId: number,
    postAuthorId: number,
  ): Promise<void> {
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after creating comment on post ${postId}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${postId}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(`v:user:${postAuthorId}:posts:list`);
      },
    );
  }

  /** Invalidates post detail cache after updating a comment. */
  async invalidateAfterUpdateComment(
    commentId: number,
    postId: number,
  ): Promise<void> {
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after updating comment ${commentId}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${postId}`);
      },
    );
  }

  /** Invalidates post detail and list caches after deleting a comment. */
  async invalidateAfterDeleteComment(
    commentId: number,
    postId: number,
    postAuthorId: number,
  ): Promise<void> {
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after deleting comment ${commentId}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${postId}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(`v:user:${postAuthorId}:posts:list`);
      },
    );
  }
}
