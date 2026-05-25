import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { runBestEffort } from "@/common/errors/run-best-effort";
import { MessageResponse } from "@/common/types/message-response.type";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";

import { UserCacheService } from "@/users/user-cache.service";
import { MODERATION_ROLE_SET } from "@/users/enums/user-role.enum";
import { AccountState } from "@/users/enums/account-state.enum";
import {
  reactivateUserCommandSchema,
  suspendUserCommandSchema,
  type ReactivateUserCommand,
  type SuspendUserCommand,
} from "@/users/schemas/privacy-account-state.schema";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { PrismaService } from "@/prisma/prisma.service";

import { Prisma } from "@prisma/client";

@Injectable()
export class UserAccountStateService {
  private readonly logger = new Logger(UserAccountStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly userCache: UserCacheService,
  ) {}

  /** Deletes the current user and clears related cache entries. */
  async deleteUser(currentUserId: number): Promise<MessageResponse> {
    let deletedUser: { username: string };

    try {
      deletedUser = await this.prisma.user.delete({
        where: { id: currentUserId },
        select: { username: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") throw new NotFoundException("User not found");
      }

      this.throwUnexpectedPersistenceFailure("delete user", err);
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to refresh caches after deleting user ${currentUserId}`,
      async () => {
        await this.userCache.clearUser(deletedUser.username, currentUserId);
        await this.cacheHelper.bumpVersion("v:user:list");
        await this.cacheHelper.bumpVersion("v:search:users");
      },
    );

    return {
      message: "User deleted successfully",
    };
  }

  /** Suspends an active user, revokes sessions, records moderation action, and invalidates visibility. */
  async suspendUser(
    input: SuspendUserCommand,
    currentUser: AuthenticatedUser,
  ): Promise<MessageResponse> {
    this.assertCanModerateUsers(currentUser);

    const data = this.parseSuspendUserInput(input);
    const target = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: {
        id: true,
        username: true,
        accountState: true,
      },
    });

    if (!target) {
      throw new NotFoundException("User not found");
    }

    if (target.accountState === AccountState.SUSPENDED) {
      throw new BadRequestException("User is already suspended");
    }

    if (target.accountState === AccountState.DEACTIVATED) {
      throw new BadRequestException("Deactivated users cannot be suspended");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: data.userId },
        data: {
          accountState: AccountState.SUSPENDED,
          accountStateReason: data.reason,
          accountStateChangedAt: new Date(),
          accountStateChangedById: currentUser.id,
        },
      });

      await tx.refreshSession.updateMany({
        where: {
          userId: data.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await tx.moderationAction.create({
        data: {
          actorId: currentUser.id,
          actionType: "SUSPEND_USER",
          targetType: "USER",
          targetId: data.userId,
          reason: data.reason,
        },
      });
    });

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate visibility caches after suspending user ${data.userId}`,
      async () => {
        await this.invalidateUserVisibilityCaches(data.userId, target.username);
      },
    );

    return {
      message: "User suspended successfully",
    };
  }

  /** Reactivates a suspended user, records moderation action, and invalidates visibility. */
  async reactivateUser(
    input: ReactivateUserCommand,
    currentUser: AuthenticatedUser,
  ): Promise<MessageResponse> {
    this.assertCanModerateUsers(currentUser);

    const data = this.parseReactivateUserInput(input);
    const target = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: {
        id: true,
        username: true,
        accountState: true,
      },
    });

    if (!target) {
      throw new NotFoundException("User not found");
    }

    if (target.accountState !== AccountState.SUSPENDED) {
      throw new BadRequestException("Only suspended users can be reactivated");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: data.userId },
        data: {
          accountState: AccountState.ACTIVE,
          accountStateReason: data.reason,
          accountStateChangedAt: new Date(),
          accountStateChangedById: currentUser.id,
        },
      });

      await tx.moderationAction.create({
        data: {
          actorId: currentUser.id,
          actionType: "REACTIVATE_USER",
          targetType: "USER",
          targetId: data.userId,
          reason: data.reason,
        },
      });
    });

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate visibility caches after reactivating user ${data.userId}`,
      async () => {
        await this.invalidateUserVisibilityCaches(data.userId, target.username);
      },
    );

    return {
      message: "User reactivated successfully",
    };
  }

  /** Invalidates user/profile/post caches affected by privacy or account-state changes. */
  async invalidateUserVisibilityCaches(
    userId: number,
    username: string,
  ): Promise<void> {
    const postIds = await this.prisma.post.findMany({
      where: {
        authorId: userId,
      },
      select: {
        id: true,
      },
    });

    await this.userCache.clearUser(username, userId);
    await this.cacheHelper.bumpVersion("v:user:list");
    await this.cacheHelper.bumpVersion("v:search:users");
    await this.cacheHelper.bumpVersion("v:posts:list");
    await this.cacheHelper.bumpVersion(`v:user:${userId}:posts:list`);

    for (const post of postIds) {
      await this.cacheHelper.del(`posts:detail:${post.id}`);
    }
  }

  /** Parses and normalizes moderator suspension input. */
  private parseSuspendUserInput(input: SuspendUserCommand) {
    return parseWithBadRequest(
      suspendUserCommandSchema,
      input,
      "Invalid suspend user input",
    );
  }

  /** Parses and normalizes moderator reactivation input. */
  private parseReactivateUserInput(input: ReactivateUserCommand) {
    return parseWithBadRequest(
      reactivateUserCommandSchema,
      input,
      "Invalid reactivate user input",
    );
  }

  /** Ensures only moderators and admins can mutate account state. */
  private assertCanModerateUsers(currentUser: AuthenticatedUser): void {
    if (!currentUser.role || !MODERATION_ROLE_SET.has(currentUser.role)) {
      throw new ForbiddenException("Forbidden resource");
    }
  }

  /** Logs unexpected persistence failures and throws a sanitized error. */
  private throwUnexpectedPersistenceFailure(
    action: "delete user",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}
