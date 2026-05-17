import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { PasswordService } from "@/common/security/password.service";
import { decodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";
import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import {
  buildChronologicalCursorFilter,
  buildCursorPage,
  normalizeCursorTake,
  type CursorPageResult,
} from "@/common/pagination/cursor-pagination";

import { SafeUserSelect, type SafeUserDTO } from "@/users/dto/safe-user.dto";
import { MyPrivacySettings } from "@/users/models/my-privacy-settings.model";
import { MODERATION_ROLE_SET } from "@/users/enums/user-role.enum";
import { AccountState } from "@/users/enums/account-state.enum";
import { UserCacheService } from "@/users/user-cache.service";
import {
  createUserCommandSchema,
  updateMyProfileCommandSchema,
  updateUserCommandSchema,
  type CreateUserCommand,
  type UpdateMyProfileCommand,
  type UpdateUserCommand,
} from "@/users/schemas/user-write.schema";
import {
  CreatedUserSelect,
  type CreatedUserDTO,
} from "@/users/dto/created-user.dto";
import {
  reactivateUserCommandSchema,
  suspendUserCommandSchema,
  updateMyPrivacySettingCommandSchema,
  type ReactivateUserCommand,
  type SuspendUserCommand,
  type UpdateMyPrivacySettingCommand,
} from "@/users/schemas/privacy-account-state.schema";
import {
  UserProfileReadService,
  type SafeUserRecord,
} from "@/users/user-profile-read.service";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

type PaginationParams = {
  after?: string;
  first?: number;
  orderBy?: ChronologicalOrder;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly passwordService: PasswordService,
    private readonly userCache: UserCacheService,
    private readonly userProfileRead: UserProfileReadService,
  ) {}

  // Lists users with bounded pagination and cache support
  async findUsers(
    params?: PaginationParams,
  ): Promise<CursorPageResult<SafeUserDTO>> {
    const limit = normalizeCursorTake(params?.first);
    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderby);

    // Fetch the current cache version for the user list (used for cache invalidation)
    const v = await this.cacheHelper.getVersion("v:user:list");

    // Build a versioned cache key scoped to the current pagination params
    const cacheKey = `user:list:v=${v}:first=${limit}:after=${params?.after ?? "none"}:order=${orderby}`;

    // Return cached if present, otherwise query DB
    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.userProfileRead.findUsers({
          limit,
          orderBy: orderby,
          cursorFilter,
          sortDirection: toSortDirection(orderby),
        });

        return buildCursorPage(rows, limit);
      },
      60_000,
    );
  }

  /** Returns one viewer-aware safe user profile by id. */
  async getUser(id: number, viewer?: AuthenticatedUser): Promise<SafeUserDTO> {
    return this.userProfileRead.getUser(id, viewer);
  }

  /** Returns one viewer-aware safe user profile by username. */
  async getUserByUsername(
    username: string,
    viewer?: AuthenticatedUser,
  ): Promise<SafeUserDTO> {
    return this.userProfileRead.getUserByUsername(username, viewer);
  }

  /** Returns the authenticated owner's profile without exposing email. */
  async getMyProfile(currentUserId: number) {
    return this.userProfileRead.getMyProfile(currentUserId);
  }

  // Creates a new user with a hashed password
  async createUser(input: CreateUserCommand): Promise<CreatedUserDTO> {
    const data = this.parseCreateUserInput(input);
    const passwordHash = await this.passwordService.hashPassword(data.password);

    // Store the created user outside the try block so cache refresh can reuse it
    let user: CreatedUserDTO;

    try {
      user = await this.prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          username: data.username,
          password: passwordHash,
        },

        select: CreatedUserSelect,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          this.throwUserUniqueConflict(err, "Username or email already exists");
        }
      }

      this.throwUnexpectedPersistenceFailure("create user", err);
    }

    // Keep cache refresh failures from masking a committed user creation
    await runBestEffort(
      this.logger,
      "error",
      `Failed to refresh caches after creating user ${user.id}`,
      async () => {
        await this.userCache.cacheUsernameLookup(user.username, user.id);
        await this.cacheHelper.bumpVersion("v:user:list");
      },
    );

    return user;
  }

  // Updates the current user with the provided fields
  async updateUser(
    input: UpdateUserCommand,
    currentUserId: number,
  ): Promise<SafeUserDTO> {
    const normalizedInput = this.parseUpdateUserInput(input);

    const existingUser =
      normalizedInput.username !== undefined
        ? await this.prisma.user.findUnique({
            where: { id: currentUserId },
            select: { username: true },
          })
        : null;

    if (normalizedInput.username !== undefined && !existingUser) {
      throw new NotFoundException("User not found");
    }

    // Build the update payload safely only including provided fields
    const data: Prisma.UserUpdateInput = {};

    // Copy fields and normalize
    if (normalizedInput.name !== undefined) {
      data.name = normalizedInput.name;
    }

    if (normalizedInput.email !== undefined) {
      data.email = normalizedInput.email;
    }

    if (normalizedInput.username !== undefined) {
      data.username = normalizedInput.username;
    }

    if (normalizedInput.password !== undefined) {
      data.password = await this.passwordService.hashPassword(
        normalizedInput.password,
      );
    }

    // Store the updated user outside the try block so cache refresh can reuse it
    let updated: SafeUserDTO;

    try {
      const updatedRecord = await this.prisma.user.update({
        where: { id: currentUserId },
        data,
        select: SafeUserSelect,
      });
      updated = this.userProfileRead.toPublicUserView(
        updatedRecord as SafeUserRecord,
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") throw new NotFoundException("User not found");

        if (err.code === "P2002") {
          this.throwUserUniqueConflict(err, "Email or username already exists");
        }
      }

      this.throwUnexpectedPersistenceFailure("update user", err);
    }

    // Keep cache refresh failures from masking a committed user update
    await runBestEffort(
      this.logger,
      "error",
      `Failed to refresh caches after updating user ${currentUserId}`,
      async () => {
        if (
          existingUser !== null &&
          existingUser.username !== updated.username
        ) {
          await this.cacheHelper.del(
            this.userCache.getUserUsernameLookupCacheKey(existingUser.username),
          );
        }

        await this.userCache.cacheUser(updated);
        await this.cacheHelper.bumpVersion("v:user:list");
      },
    );

    return updated;
  }

  /** Updates the current user's public profile text fields and refreshes profile caches. */
  async updateMyProfile(
    input: UpdateMyProfileCommand,
    currentUserId: number,
  ): Promise<SafeUserDTO> {
    const data = this.parseUpdateMyProfileInput(input);
    const updateData: Prisma.UserUpdateInput = {};

    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.websiteUrl !== undefined) updateData.websiteUrl = data.websiteUrl;
    if (data.location !== undefined) updateData.location = data.location;

    let updated: SafeUserDTO;

    try {
      const updatedRecord = await this.prisma.user.update({
        where: { id: currentUserId },
        data: updateData,
        select: SafeUserSelect,
      });
      updated = this.userProfileRead.toPublicUserView(
        updatedRecord as SafeUserRecord,
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") throw new NotFoundException("User not found");
      }

      this.throwUnexpectedPersistenceFailure("update profile", err);
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to refresh caches after updating profile for user ${currentUserId}`,
      async () => {
        await this.userCache.cacheUser(updated);
        await this.cacheHelper.bumpVersion("v:user:list");
      },
    );

    return updated;
  }

  async getMyPrivacySettings(
    currentUserId: number,
  ): Promise<MyPrivacySettings> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        privacySetting: true,
        accountState: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return {
      message: "Privacy settings loaded successfully",
      privacySetting: user.privacySetting,
      accountState: user.accountState,
    };
  }

  async updateMyPrivacySetting(
    input: UpdateMyPrivacySettingCommand,
    currentUserId: number,
  ): Promise<MyPrivacySettings> {
    const data = this.parseUpdateMyPrivacySettingInput(input);

    const existing = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        id: true,
        username: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("User not found");
    }

    const updated = await this.prisma.user.update({
      where: { id: currentUserId },
      data: {
        privacySetting: data.privacySetting,
      },
      select: {
        privacySetting: true,
        accountState: true,
      },
    });

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate visibility caches after updating privacy for user ${currentUserId}`,
      async () => {
        await this.invalidateUserVisibilityCaches(
          currentUserId,
          existing.username,
        );
      },
    );

    return {
      message: "Privacy setting updated successfully",
      privacySetting: updated.privacySetting,
      accountState: updated.accountState,
    };
  }

  // Deletes the current user and clears related cache entries
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

    // Keep cache refresh failures from masking a committed user deletion
    await runBestEffort(
      this.logger,
      "error",
      `Failed to refresh caches after deleting user ${currentUserId}`,
      async () => {
        await this.userCache.clearUser(deletedUser.username, currentUserId);
        await this.cacheHelper.bumpVersion("v:user:list");
      },
    );

    return {
      message: "User deleted successfully",
    };
  }

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

  // Private Helpers
  // Parses and normalizes create-user input
  private parseCreateUserInput(input: CreateUserCommand) {
    return parseWithBadRequest(
      createUserCommandSchema,
      input,
      "Invalid user input",
    );
  }

  // Parses and normalizes update-user input
  private parseUpdateUserInput(input: UpdateUserCommand) {
    return parseWithBadRequest(
      updateUserCommandSchema,
      input,
      "Invalid user input",
    );
  }

  /** Parses and normalizes public profile text updates for the current user. */
  private parseUpdateMyProfileInput(input: UpdateMyProfileCommand) {
    return parseWithBadRequest(
      updateMyProfileCommandSchema,
      input,
      "Invalid profile input",
    );
  }

  /** Parses and normalizes privacy-setting updates for the current user. */
  private parseUpdateMyPrivacySettingInput(
    input: UpdateMyPrivacySettingCommand,
  ) {
    return parseWithBadRequest(
      updateMyPrivacySettingCommandSchema,
      input,
      "Invalid privacy setting input",
    );
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

  /** Invalidates user/profile/post caches affected by privacy or account-state changes. */
  private async invalidateUserVisibilityCaches(
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
    await this.cacheHelper.bumpVersion("v:posts:list");
    await this.cacheHelper.bumpVersion(`v:user:${userId}:posts:list`);

    for (const post of postIds) {
      await this.cacheHelper.del(`posts:detail:${post.id}`);
    }
  }

  // Maps unique user constraint violations to specific conflict errors
  private throwUserUniqueConflict(
    err: Prisma.PrismaClientKnownRequestError,
    fallbackMessage: string,
  ): never {
    const target = (err.meta as { target?: string[] | string } | undefined)
      ?.target;

    if (Array.isArray(target)) {
      if (target.includes("email")) {
        throw new ConflictException("Email already exists");
      }

      if (target.includes("username")) {
        throw new ConflictException("Username already exists");
      }
    }

    throw new ConflictException(fallbackMessage);
  }

  // Logs unexpected persistence failures and throws a sanitized error
  private throwUnexpectedPersistenceFailure(
    action: "create user" | "update user" | "delete user" | "update profile",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}
