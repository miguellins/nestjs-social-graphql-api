import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { PasswordService } from "@/common/security/password.service";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";

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
 * Handles user queries and account-management workflows
 */

type PaginationParams = {
  take?: number;
  orderBy?: ChronologicalOrder;
};

@Injectable()
export class UsersService {
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

    try {
      const passwordHash = await this.passwordService.hashPassword(
        data.password,
      );

      const user = await this.prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          username: data.username,
          password: passwordHash,
        },

        select: SafeUserSelect,
      });

      await this.cacheHelper.set(`user:safe:${user.id}`, user, 5 * 60_000);

      await this.cacheHelper.bumpVersion("v:user:list");

      return user;
    } catch (err) {
      // Handle known Prisma errors (like unique constraint violations)
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // P2002 = Unique constraint failed
        if (err.code === "P2002") {
          // err.meta?.target usually contains which unique field(s) failed
          const target = (
            err.meta as { target?: string[] | string } | undefined
          )?.target;

          // Give a more precise conflict message (professional UX)
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

      // For anything unexpected, do NOT leak internal details to clients
      throw new InternalServerErrorException("Failed to create user");
    }
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

    try {
      const updated = await this.prisma.user.update({
        where: { id: currentUserId },
        data,
        select: SafeUserSelect,
      });

      await this.cacheHelper.set(
        `user:safe:${currentUserId}`,
        updated, // no DB call; use what we already have
        5 * 60_000,
      );

      await this.cacheHelper.bumpVersion("v:user:list");

      return updated;
    } catch (err) {
      // If user doesnt exist, prisma throws P2025 on update
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") throw new NotFoundException("User not found");

        // P2002 = unique constraints failed (email/username already exists)
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

      // Unknown error
      throw new InternalServerErrorException("Failed to update user");
    }
  }

  // Deletes the current user and clears related cache entries
  async deleteUser(currentUserId: number) {
    try {
      // 'delete' is intentional:
      // - it guarantees exactly ONE record
      // - Prisma throws if the user does not exist
      await this.prisma.user.delete({
        where: { id: currentUserId },
      });

      // Remove the deleted user's detail cache
      await this.cacheHelper.del(`user:safe:${currentUserId}`);

      // Invalidate all cached user lists via version bump
      await this.cacheHelper.bumpVersion("v:user:list");

      return {
        message: "User deleted successfully",
      };
    } catch (err) {
      // Prisma throws P2025 when record does not exist
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") throw new NotFoundException("User not found");
      }

      // Do not leak internal DB errors
      throw new InternalServerErrorException("Failed to delete user");
    }
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
