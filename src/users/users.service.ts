import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { PasswordService } from "@/common/security/password.service";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";

import {
  createUserCommandSchema,
  updateUserCommandSchema,
} from "@/users/schemas/user-write.schema";
import type {
  CreateUserCommand,
  UpdateUserCommand,
} from "@/users/schemas/user-write.schema";
import type { SafeUserDTO } from "@/users/dto/safe-user.dto";
import { SafeUserSelect } from "@/users/dto/safe-user.dto";

import { PrismaService } from "@/prisma.service";
import { Prisma } from "@prisma/client";

/**
 * Service for user workflows
 *
 * Creates, reads, updates, and deletes user accounts
 */

type PaginationParams = {
  take?: number;
  orderBy?: ChronologicalOrder;
};

@Injectable()
export class UsersService {
  // Logger for UsersService domain errors and best-effort operations
  private readonly logger = new Logger(UsersService.name);

  // Injects the services used by user workflows
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly passwordService: PasswordService,
  ) {}

  // Lists users with bounded pagination and cache support
  async findUsers(params?: PaginationParams): Promise<SafeUserDTO[]> {
    // Ensures the value never exceeds MAX_TAKE (number of records per request)
    const limit = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    // Default to newest-first when no explicit chronological order is provided
    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;

    // Fetch the current cache version for the user list (used for cache invalidation)
    const v = await this.cacheHelper.getVersion("v:user:list");

    // Build a versioned cache key scoped to the current pagination params
    const cacheKey = `user:list:v=${v}:take=${limit}:order=${orderby}`;

    // Read-through cache:
    // - return cached if present, otherwise query DB
    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        return this.prisma.user.findMany({
          take: limit,

          orderBy: {
            createdAt: toSortDirection(orderby),
          },

          select: SafeUserSelect,
        });
      },
      60_000,
    );
  }

  // Returns one safe user profile by id
  async getUser(id: number): Promise<SafeUserDTO> {
    const cacheKey = `user:safe:${id}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const user = await this.prisma.user.findUnique({
          where: { id },

          select: SafeUserSelect,
        });

        if (!user) throw new NotFoundException(`User with ID ${id} not found`);

        return user;
      },
      5 * 60_000, // Cache user profile longer than list (profiles change less often)
    );
  }

  // Creates a new user with a hashed password
  async createUser(input: CreateUserCommand): Promise<SafeUserDTO> {
    const data = this.parseCreateUserInput(input);
    const passwordHash = await this.passwordService.hashPassword(data.password);

    // Store the created user outside the try block so cache refresh can reuse it
    let user: SafeUserDTO;

    try {
      user = await this.prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          username: data.username,
          password: passwordHash,
        },

        select: SafeUserSelect,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Keep unique-field conflicts explicit instead of deferring to a generic duplicate message.
        if (err.code === "P2002") {
          const target = (
            err.meta as { target?: string[] | string } | undefined
          )?.target;

          if (Array.isArray(target)) {
            if (target.includes("email")) {
              throw new ConflictException("Email already exists");
            }
            if (target.includes("username")) {
              throw new ConflictException("Username already exists");
            }
          }

          // Fallback if meta is missing
          throw new ConflictException("Username or email already exists");
        }
      }

      throw err;
    }

    // Keep cache refresh failures from masking a committed user creation
    await runBestEffort(
      this.logger,
      "error",
      `Failed to refresh caches after creating user ${user.id}`,
      async () => {
        await this.cacheHelper.set(`user:safe:${user.id}`, user, 5 * 60_000);
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
      updated = await this.prisma.user.update({
        where: { id: currentUserId },
        data,
        select: SafeUserSelect,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Preserve the local not-found response for update races.
        if (err.code === "P2025") throw new NotFoundException("User not found");

        // Keep unique-field conflicts explicit instead of deferring to a generic duplicate message.
        if (err.code === "P2002") {
          const target = (
            err.meta as { target?: string[] | string } | undefined
          )?.target;

          if (Array.isArray(target)) {
            if (target.includes("email")) {
              throw new ConflictException("Email already exists");
            }
            if (target.includes("username")) {
              throw new ConflictException("Username already exists");
            }
          }

          throw new ConflictException("Email or username already exists");
        }
      }

      throw err;
    }

    // Keep cache refresh failures from masking a committed user update
    await runBestEffort(
      this.logger,
      "error",
      `Failed to refresh caches after updating user ${currentUserId}`,
      async () => {
        await this.cacheHelper.set(
          `user:safe:${currentUserId}`,
          updated,
          5 * 60_000,
        );
        await this.cacheHelper.bumpVersion("v:user:list");
      },
    );

    return updated;
  }

  // Deletes the current user and clears related cache entries
  async deleteUser(currentUserId: number): Promise<MessageResponse> {
    try {
      await this.prisma.user.delete({
        where: { id: currentUserId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Preserve the local not-found response for delete races.
        if (err.code === "P2025") throw new NotFoundException("User not found");
      }

      throw err;
    }

    // Keep cache refresh failures from masking a committed user deletion
    await runBestEffort(
      this.logger,
      "error",
      `Failed to refresh caches after deleting user ${currentUserId}`,
      async () => {
        await this.cacheHelper.del(`user:safe:${currentUserId}`);
        await this.cacheHelper.bumpVersion("v:user:list");
      },
    );

    return {
      message: "User deleted successfully",
    };
  }

  // Parses and normalizes create-user input for the service layer
  private parseCreateUserInput(input: CreateUserCommand) {
    return parseWithBadRequest(
      createUserCommandSchema,
      input,
      "Invalid user input",
    );
  }

  // Parses and normalizes update-user input for the service layer
  private parseUpdateUserInput(input: UpdateUserCommand) {
    return parseWithBadRequest(
      updateUserCommandSchema,
      input,
      "Invalid user input",
    );
  }
}
