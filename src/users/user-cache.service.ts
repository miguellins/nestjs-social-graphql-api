import { Injectable } from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";

import type { SafeUserDTO } from "@/users/dto/safe-user.dto";

const USER_CACHE_TTL_MS = 5 * 60_000;

/**
 * Feature-private user cache helpers
 *
 * Owns user cache keys and cache refresh/clear behavior
 */

@Injectable()
export class UserCacheService {
  constructor(private readonly cacheHelper: CacheHelperService) {}

  // Builds the cache key for one safe user profile
  getUserCacheKey(id: number): string {
    return `user:safe:${id}`;
  }

  // Builds the cache key for one username-to-id lookup
  getUserUsernameLookupCacheKey(username: string): string {
    return `user:lookup:username:${username}`;
  }

  // Returns a cached user id for one username when available
  async getCachedUserIdByUsername(
    username: string,
  ): Promise<number | undefined> {
    return this.cacheHelper.get<number>(
      this.getUserUsernameLookupCacheKey(username),
    );
  }

  // Caches the safe user profile and canonical username lookup together
  async cacheUser(user: SafeUserDTO): Promise<void> {
    await this.cacheHelper.set(
      this.getUserCacheKey(user.id),
      user,
      USER_CACHE_TTL_MS,
    );
    await this.cacheHelper.set(
      this.getUserUsernameLookupCacheKey(user.username),
      user.id,
      USER_CACHE_TTL_MS,
    );
  }

  // Caches only the username-to-id lookup
  async cacheUsernameLookup(username: string, userId: number): Promise<void> {
    await this.cacheHelper.set(
      this.getUserUsernameLookupCacheKey(username),
      userId,
      USER_CACHE_TTL_MS,
    );
  }

  // Clears the safe user profile and username lookup cache entries
  async clearUser(username: string, userId: number): Promise<void> {
    await this.cacheHelper.del(this.getUserCacheKey(userId));
    await this.cacheHelper.del(this.getUserUsernameLookupCacheKey(username));
  }
}
