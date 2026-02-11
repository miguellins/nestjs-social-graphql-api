import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";

import { SafeUserProfile } from "./models/safe-user-profile.model";

import { CreateUserInput } from "./dto/create-user.input";
import { UpdateUserInput } from "./dto/update-user.input";

import { PrismaService } from "src/prisma.service";
import { Prisma } from "@prisma/client";

import * as bcrypt from "bcrypt";
import { SafeUser } from "./models/safe-user.model";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  async findUsers(params?: { take?: number }): Promise<SafeUser[]> {
    // Hard query cap
    // Max number of records per request
    const MAX_TAKE = 50;

    // Default number of users returned
    const DEFAULT_TAKE = 20;

    // Determines the final limit safely
    // Ensures the value never exceeds MAX_TAKE (number of records per request)
    const limit = Math.min(params?.take ?? DEFAULT_TAKE, MAX_TAKE);

    return this.prisma.user.findMany({
      // Use the safe limit
      take: limit,

      // Order by the newest
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        username: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getUser(id: number): Promise<SafeUserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        username: true,
        createdAt: true,
        updatedAt: true,

        // Cheap and scalable way to expose relationship
        _count: {
          select: {
            posts: true,
            likes: true,
            followers: true,
            following: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    return user;
  }

  async createUser(input: CreateUserInput): Promise<SafeUser> {
    // Hash strength
    const SALT_ROUNDS = 12;

    // Normalize user inputs
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim().toLowerCase();
    const name = input.name.trim();

    try {
      // Hash password before storing in DB
      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

      // Create user and select only safe fields
      return await this.prisma.user.create({
        data: {
          name,
          email,
          username,
          password: passwordHash,
        },
        select: {
          id: true,
          name: true,
          username: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (err) {
      // Handle known Prisma errors (like unique constraint violations)
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // P2002 = Unique constraint failed
        if (err.code === "P2002") {
          // err.meta?.target usually contains which unique field(s) failed
          const target = (err.meta as any)?.target as
            | string[]
            | string
            | undefined;

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

  async updateUser(input: UpdateUserInput, currentUserId: number) {
    // Require at least one field to update, prevents empty updates
    const hasAnyField =
      input.name !== undefined ||
      input.email !== undefined ||
      input.username !== undefined ||
      input.password !== undefined;

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
      // Update user but return only safe fields
      return await this.prisma.user.update({
        where: { id: currentUserId },
        data,
        select: {
          id: true,
          name: true,
          username: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (err) {
      // If user doesnt exist, prisma throws P2025 on update
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") {
          throw new NotFoundException("User not found");
        }

        // P2002 = unique constraints failed (email/username already exists)
        if (err.code === "P2002") {
          const target = (err.meta as any)?.target as
            | string[]
            | string
            | undefined;

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
      // `delete` is intentional:
      // - it guarantees exactly ONE record
      // - Prisma throws if the user does not exist
      await this.prisma.user.delete({
        where: { id: currentUserId },
      });

      // Return a simple, predictable response
      return {
        message: "User deleted successfully",
      };
    } catch (err) {
      // Prisma throws P2025 when record does not exist
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") {
          throw new NotFoundException("User not found");
        }
      }

      // Do not leak internal DB errors
      throw new InternalServerErrorException("Failed to delete user");
    }
  }
}
