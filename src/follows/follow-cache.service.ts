import { Injectable, Logger } from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { runBestEffort } from "@/common/errors/run-best-effort";

@Injectable()
export class FollowCacheService {
  private readonly logger = new Logger(FollowCacheService.name);

  constructor(private readonly cacheHelper: CacheHelperService) {}

  /** Invalidates caches affected by creating a follow relationship. */
  async invalidateAfterCreateFollow(
    followId: number,
    followerId: number,
    followingId: number,
  ): Promise<void> {
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after creating follow ${followId}`,
      async () => {
        await this.cacheHelper.bumpVersion("v:follows:list");
        await this.cacheHelper.del(`user:safe:${followerId}`);
        await this.cacheHelper.del(`user:safe:${followingId}`);
        await this.cacheHelper.bumpVersion("v:user:list");
      },
    );
  }

  /** Invalidates visibility caches after approving a private follow request. */
  async invalidateAfterApproveFollowRequest(
    requestId: number,
    followerId: number,
    followingId: number,
  ): Promise<void> {
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after approving follow request ${requestId}`,
      async () => {
        await this.invalidateVisibilityCaches(followerId, followingId);
      },
    );
  }

  /** Invalidates detail, list, user, and visibility caches after deleting a follow. */
  async invalidateAfterDeleteFollow(follow: {
    id: number;
    followerId: number;
    followingId: number;
  }): Promise<void> {
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after deleting follow ${follow.id}`,
      async () => {
        await this.invalidateVisibilityCaches(
          follow.followerId,
          follow.followingId,
        );
        await this.cacheHelper.del(`follow:detail:${follow.id}`);
        await this.cacheHelper.bumpVersion("v:follows:list");
        await this.cacheHelper.del(`user:safe:${follow.followerId}`);
        await this.cacheHelper.del(`user:safe:${follow.followingId}`);
        await this.cacheHelper.bumpVersion("v:user:list");
      },
    );
  }

  /** Invalidates caches affected by relationship changes that change post visibility. */
  async invalidateVisibilityCaches(
    followerId: number,
    followingId: number,
  ): Promise<void> {
    await this.cacheHelper.bumpVersion(`v:user:${followingId}:posts:list`);
    await this.cacheHelper.bumpVersion("v:posts:list");
    await this.cacheHelper.del(`user:safe:${followerId}`);
    await this.cacheHelper.del(`user:safe:${followingId}`);
    await this.cacheHelper.bumpVersion("v:user:list");
  }
}
