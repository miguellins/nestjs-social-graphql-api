import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "src/prisma.service";

import { Prisma } from "@prisma/client";

import * as bcrypt from "bcrypt";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllUsers() {
    return this.prisma.user.findMany({
      include: {
        posts: true,
        likes: { include: { post: true } },
        followers: { include: { follower: true } },
        following: { include: { following: true } },
      },
    });
  }

  async getUser(id: number) {
    try {
      return await this.prisma.user.findUnique({
        where: { id },
        include: {
          posts: { include: { likes: true, author: true } },
          likes: { include: { post: true } },
          followers: { include: { follower: true } },
          following: { include: { following: true } },
        },
      });
    } catch (err) {
      throw new Error(err.message);
    }
  }

  async createUser(input: {
    name: string;
    email: string;
    username: string;
    password: string;
  }) {
    const existingUser = await this.prisma.user.findUnique({
      where: { username: input.username },
    });

    if (existingUser) {
      throw new ConflictException("Username or email already exists");
    }

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(input.password, 12);

    return this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        username: input.username,
        password: hashedPassword,
      },
    });
  }

  async updateUser(
    input: {
      name?: string;
      email?: string;
      username?: string;
      password?: string;
    },
    currentUserId: number,
  ) {
    const data: Prisma.UserUpdateInput = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.username !== undefined) data.username = input.username;

    if (input.password !== undefined)
      data.password = await bcrypt.hash(input.password, 12);

    try {
      return await this.prisma.user.update({
        where: { id: currentUserId },
        data,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const fields =
          (err.meta?.target as string[] | undefined)?.join(", ") ??
          "unique field";

        throw new ConflictException(`User with this ${fields} already exists`);
      }

      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        throw new NotFoundException("User not found");
      }

      throw new InternalServerErrorException("Failed to update user");
    }
  }

  async deleteUser(id: number, currentUserId: number) {
    if (id !== currentUserId) {
      throw new ForbiddenException(
        "You do not have permission to delete this user",
      );
    }

    try {
      return await this.prisma.user.delete({
        where: { id },
      });
    } catch (err) {
      // Prisma throws P2025 when record doesn't exist
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        throw new NotFoundException("User not found");
      }

      throw new InternalServerErrorException("Failed to delete user");
    }
  }
}
