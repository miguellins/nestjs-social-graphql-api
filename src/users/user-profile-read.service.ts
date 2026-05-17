import { Injectable, Logger, NotFoundException } from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";

import { R2StorageService } from "@/media/storage/r2-storage.service";

import {
  MyProfileSelect,
  SafeUserSelect,
  type MyProfileDTO,
  type SafeUserAvatarMediaDTO,
  type SafeUserDTO,
} from "@/users/dto/safe-user.dto";
import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { AccountState } from "@/users/enums/account-state.enum";
import { UserCacheService } from "@/users/user-cache.service";
import {
  getUserByUsernameCommandSchema,
  type GetUserByUsernameCommand,
} from "@/users/schemas/user-read.schema";

import { PrismaService } from "@/prisma/prisma.service";
import { MediaStatus, type Prisma } from "@prisma/client";

import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

export type SafeUserRecord = Omit<SafeUserDTO, "avatarUrl"> & {
  avatarMedia?: SafeUserAvatarMediaDTO | null;
};

type MyProfileRecord = SafeUserRecord & {
  media?: Array<{
    id: number;
    status: MediaStatus;
    objectKey: string;
    createdAt: Date;
  }>;
};

@Injectable()
export class UserProfileReadService {
  private readonly logger = new Logger(UserProfileReadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly userCache: UserCacheService,
    private readonly r2Storage: R2StorageService,
  ) {}

  /** Lists active public user previews with bounded pagination and cache support. */
  async findUsers(params: {
    limit: number;
    after?: string;
    orderBy: "NEWEST" | "OLDEST";
    cursorFilter?: Prisma.UserWhereInput;
    sortDirection: "asc" | "desc";
  }): Promise<SafeUserDTO[]> {
    const rows = await this.prisma.user.findMany({
      take: params.limit + 1,
      where: params.cursorFilter
        ? {
            AND: [
              params.cursorFilter,
              {
                accountState: AccountState.ACTIVE,
              },
            ],
          }
        : {
            accountState: AccountState.ACTIVE,
          },
      orderBy: [
        { createdAt: params.sortDirection },
        { id: params.sortDirection },
      ],
      select: SafeUserSelect,
    });

    return rows.map((row) => this.toPublicUserView(row as SafeUserRecord));
  }

  /** Returns one viewer-aware safe user profile by id. */
  async getUser(id: number, viewer?: AuthenticatedUser): Promise<SafeUserDTO> {
    const cacheKey = this.userCache.getUserCacheKey(id);
    const user = await this.cacheHelper.getOrSet(
      cacheKey,
      async () => this.loadCachedSafeUser(id),
      5 * 60_000,
    );

    await this.assertCanViewProfile(user, viewer);

    return user;
  }

  /** Returns one viewer-aware safe user profile by username. */
  async getUserByUsername(
    username: string,
    viewer?: AuthenticatedUser,
  ): Promise<SafeUserDTO> {
    const normalized = this.parseGetUserByUsernameInput({ username });
    const cachedId = await this.userCache.getCachedUserIdByUsername(
      normalized.username,
    );

    if (cachedId !== undefined) {
      return this.getUser(cachedId, viewer);
    }

    const user = await this.prisma.user.findUnique({
      where: { username: normalized.username },
      select: SafeUserSelect,
    });

    if (!user) {
      throw new NotFoundException(
        `User with username "${normalized.username}" not found`,
      );
    }

    const projected = this.toPublicUserView(user as SafeUserRecord);
    await runBestEffort(
      this.logger,
      "error",
      `Failed to refresh caches after looking up user ${projected.id} by username`,
      async () => {
        await this.userCache.cacheUser(projected);
      },
    );
    await this.assertCanViewProfile(projected, viewer);

    return projected;
  }

  /** Returns the authenticated owner profile without exposing email. */
  async getMyProfile(currentUserId: number): Promise<MyProfileDTO> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: MyProfileSelect,
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const projected = this.toPublicUserView(user as MyProfileRecord);
    const pending = (user as MyProfileRecord).media?.[0];
    const pendingAvatarUrl = pending
      ? this.getPublicAvatarUrl(pending.objectKey)
      : null;

    return {
      ...projected,
      pendingAvatar:
        pending && pendingAvatarUrl
          ? {
              id: pending.id,
              status: pending.status,
              avatarUrl: pendingAvatarUrl,
              createdAt: pending.createdAt,
            }
          : null,
    };
  }

  /** Applies public profile projection and derives avatar URLs from READY media only. */
  toPublicUserView(user: SafeUserRecord): SafeUserDTO {
    const avatarUrl =
      user.avatarMedia?.status === MediaStatus.READY
        ? this.getPublicAvatarUrl(user.avatarMedia.objectKey)
        : null;

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      bio: user.bio,
      websiteUrl: user.websiteUrl,
      location: user.location,
      avatarUrl,
      privacySetting: user.privacySetting,
      accountState: user.accountState,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      _count: user._count,
    };
  }

  /** Derives an avatar URL only when media storage is configured. */
  private getPublicAvatarUrl(objectKey: string): string | null {
    if (!this.r2Storage.isConfigured()) {
      return null;
    }

    return this.r2Storage.getPublicUrl(objectKey);
  }

  /** Loads one user into the base cache without viewer-specific decisions. */
  private async loadCachedSafeUser(id: number): Promise<SafeUserDTO> {
    const safeUser = await this.prisma.user.findUnique({
      where: { id },
      select: SafeUserSelect,
    });

    if (!safeUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.toPublicUserView(safeUser as SafeUserRecord);
  }

  /** Enforces block, account-state, and private-follower profile visibility. */
  private async assertCanViewProfile(
    user: SafeUserDTO,
    viewer?: AuthenticatedUser,
  ): Promise<void> {
    if (user.accountState !== AccountState.ACTIVE) {
      throw new NotFoundException("User not found");
    }

    if (viewer?.id === user.id) {
      return;
    }

    if (!viewer) {
      if (user.privacySetting === UserPrivacySetting.PRIVATE) {
        throw new NotFoundException("User not found");
      }

      return;
    }

    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewer.id, blockedId: user.id },
          { blockerId: user.id, blockedId: viewer.id },
        ],
      },
      select: { id: true },
    });

    if (block) {
      throw new NotFoundException("User not found");
    }

    if (user.privacySetting !== UserPrivacySetting.PRIVATE) {
      return;
    }

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewer.id,
          followingId: user.id,
        },
      },
      select: { id: true },
    });

    if (!follow) {
      throw new NotFoundException("User not found");
    }
  }

  /** Parses and normalizes public username lookup input. */
  private parseGetUserByUsernameInput(input: GetUserByUsernameCommand) {
    return parseWithBadRequest(
      getUserByUsernameCommandSchema,
      input,
      "Invalid user lookup input",
    );
  }
}
