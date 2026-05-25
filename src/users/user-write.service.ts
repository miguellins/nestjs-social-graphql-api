import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { PasswordService } from "@/common/security/password.service";
import { runBestEffort } from "@/common/errors/run-best-effort";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";

import { SafeUserSelect, type SafeUserDTO } from "@/users/dto/safe-user.dto";
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
  UserProfileReadService,
  type SafeUserRecord,
} from "@/users/user-profile-read.service";

import { PrismaService } from "@/prisma/prisma.service";

import { Prisma } from "@prisma/client";

@Injectable()
export class UserWriteService {
  private readonly logger = new Logger(UserWriteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly passwordService: PasswordService,
    private readonly userCache: UserCacheService,
    private readonly userProfileRead: UserProfileReadService,
  ) {}

  /** Creates a new user with normalized input, a hashed password, and best-effort cache refresh. */
  async createUser(input: CreateUserCommand): Promise<CreatedUserDTO> {
    const data = this.parseCreateUserInput(input);
    const passwordHash = await this.passwordService.hashPassword(data.password);

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

    await runBestEffort(
      this.logger,
      "error",
      `Failed to refresh caches after creating user ${user.id}`,
      async () => {
        await this.userCache.cacheUsernameLookup(user.username, user.id);
        await this.cacheHelper.bumpVersion("v:user:list");
        await this.cacheHelper.bumpVersion("v:search:users");
      },
    );

    return user;
  }

  /** Updates account fields and refreshes safe-user and username lookup caches. */
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

    const data: Prisma.UserUpdateInput = {};

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
        await this.cacheHelper.bumpVersion("v:search:users");
      },
    );

    return updated;
  }

  /** Updates public profile text fields and refreshes profile caches. */
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
        await this.cacheHelper.bumpVersion("v:search:users");
      },
    );

    return updated;
  }

  /** Parses and normalizes create-user input. */
  private parseCreateUserInput(input: CreateUserCommand) {
    return parseWithBadRequest(
      createUserCommandSchema,
      input,
      "Invalid user input",
    );
  }

  /** Parses and normalizes account update input. */
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

  /** Maps unique user constraint violations to specific conflict errors. */
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

  /** Logs unexpected persistence failures and throws a sanitized error. */
  private throwUnexpectedPersistenceFailure(
    action: "create user" | "update user" | "update profile",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}
