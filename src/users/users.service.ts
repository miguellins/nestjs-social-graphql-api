import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  Inject,
} from "@nestjs/common";

import { CACHE_MANAGER } from "@nestjs/cache-manager";

import { PAGINATION } from "@/common/constants/hard-cap.constants";

import { PaginationArgs } from "@/common/args/pagination.args";

import { SafeUserDTO, SafeUserSelect } from "@/users/dto/safe-user.dto";
import { CreateUserInput } from "@/users/dto/create-user.input";
import { UpdateUserInput } from "@/users/dto/update-user.input";

import { PrismaService } from "@/prisma.service";
import { Prisma } from "@prisma/client";

import type { Cache } from "cache-manager";

import * as bcrypt from "bcrypt";

/**
 * Responsible for business logic and data operations
 */

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async findUsers(params?: PaginationArgs): Promise<SafeUserDTO[]> {
    // Ensures the value never exceeds MAX_TAKE (number of records per request)
    const limit = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    // Fetch the current cache version for the user list (used for cache invalidation)
    const v = (await this.cache.get<number>("v:user:list")) ?? 1;

    // Build a versioned cache key scoped to the current pagination params
    const key = `user:list:v=${v}:take=${limit}`;

    // Return cached result immediately if available
    const cached = await this.cache.get<SafeUserDTO[]>(key);
    if (cached) return cached;

    // Cache miss - query the database
    const users = await this.prisma.user.findMany({
      take: limit,

      orderBy: {
        createdAt: "desc",
      },

      select: SafeUserSelect,
    });

    // Store result in cache for 60 seconds before expiry
    await this.cache.set(key, users, 60_000);

    return users;
  }

  async getUser(id: number): Promise<SafeUserDTO> {
    const key = `user:safe:${id}`;

    const cached = await this.cache.get<SafeUserDTO>(key);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { id },

      select: SafeUserSelect,
    });

    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    // Cache user profile longer than list (profiles change less often)
    await this.cache.set(key, user, 5 * 60_000);

    return user;
  }

  async createUser(input: CreateUserInput): Promise<SafeUserDTO> {
    // Hash strength
    const SALT_ROUNDS = 12;

    // Normalize user inputs
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim().toLowerCase();
    const password = input.password.trim();

    if (!name) throw new BadRequestException("Name is required");
    if (!email) throw new BadRequestException("Email is required");
    if (!username) throw new BadRequestException("Username is required");
    if (!password) throw new BadRequestException("Password is required");

    try {
      // Hash password before storing in DB
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      const user = await this.prisma.user.create({
        data: {
          name,
          email,
          username,
          password: passwordHash,
        },

        select: SafeUserSelect,
      });

      // Store the newly created user's public profile in cache
      await this.cache.set(`user:safe:${user.id}`, user, 5 * 60_000);

      // Read the current list cache version (used to invalidate paginated lists)
      const v = (await this.cache.get<number>("v:user:list")) ?? 1;

      // Increment the version so all previously cached user lists become stale
      // Avois manually deleting multiple list keys
      // TTL is set to a long duration (1 year in ms) to prevent accidental expiration
      await this.cache.set("v:user:list", v + 1, 365 * 24 * 60 * 60_000);

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
            if (target.includes("email"))
              throw new ConflictException("Email already exists");
            if (target.includes("username"))
              throw new ConflictException("Username already exists");
          }

          // Fallback if meta is missing
          throw new ConflictException("Username or email already exists");
        }
      }

      // For anything unexpected, do NOT leak internal details to clients
      throw new InternalServerErrorException("Failed to create user");
    }
  }

  async updateUser(
    input: UpdateUserInput,
    currentUserId: number,
  ): Promise<SafeUserDTO> {
    // Require at least one field to update, prevents empty updates
    const hasAnyField = Object.values(input).some((v) => v !== undefined);

    if (!hasAnyField)
      throw new BadRequestException("No fields provided to update");

    // Hash strength
    const SALT_ROUNDS = 12;

    // Build the update payload safely only including provided fields
    const data: Prisma.UserUpdateInput = {};

    // Copy fields and normalize
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException("Name cannot be empty");
      data.name = name;
    }

    if (input.email !== undefined) {
      const email = input.email.trim().toLowerCase();
      if (!email) throw new BadRequestException("Email cannot be empty");
      data.email = email;
    }

    if (input.username !== undefined) {
      const username = input.username.trim().toLowerCase();
      if (!username) throw new BadRequestException("Username cannot be empty");
      data.username = username;
    }

    if (input.password !== undefined) {
      const pw = input.password.trim();
      if (!pw) throw new BadRequestException("Password cannot be empty");
      data.password = await bcrypt.hash(pw, SALT_ROUNDS);
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: currentUserId },
        data,
        select: SafeUserSelect,
      });

      // Keep user detail cache consistent
      await this.cache.set(`user:safe:${currentUserId}`, updated, 5 * 60_000);

      // Invalidate all cached user lists (via version bump)
      const v = (await this.cache.get<number>("v:user:list")) ?? 1;
      await this.cache.set("v:user:list", v + 1, 365 * 24 * 60 * 60_000);

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
            if (target.includes("email"))
              throw new ConflictException("Email already exists");
            if (target.includes("username"))
              throw new ConflictException("Username already exists");
          }

          throw new ConflictException("Email or username already exists");
        }
      }

      // Unknown error
      throw new InternalServerErrorException("Failed to update user");
    }
  }

  async deleteUser(currentUserId: number) {
    try {
      // 'delete' is intentional:
      // - it guarantees exactly ONE record
      // - Prisma throws if the user does not exist
      await this.prisma.user.delete({
        where: { id: currentUserId },
      });

      // Remove the deleted user's detail cache
      await this.cache.del(`user:safe:${currentUserId}`);

      // Invalidate all cached user lists (via version bump)
      const v = (await this.cache.get<number>("v:user:list")) ?? 1;
      await this.cache.set("v:user:list", v + 1, 365 * 24 * 60 * 60_000);

      // Return a simple, predictable response
      return {
        message: "User deleted successfully",
      };
    } catch (err) {
      // Prisma throws P2025 when record does not exist
      if (err instanceof Prisma.PrismaClientKnownRequestError)
        if (err.code === "P2025") throw new NotFoundException("User not found");

      // Do not leak internal DB errors
      throw new InternalServerErrorException("Failed to delete user");
    }
  }
}
