import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";

import { CreateUserInput } from "./dto/create-user.input";
import { UpdateUserInput } from "./dto/update-user.input";

import { PrismaService } from "src/prisma.service";

import { Prisma } from "@prisma/client";

import * as bcrypt from "bcrypt";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

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
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        posts: { include: { likes: true, author: true } },
        likes: { include: { post: true } },
        followers: { include: { follower: true } },
        following: { include: { following: true } },
      },
    });

    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    return user;
  }

  async createUser(input: CreateUserInput) {
    try {
      const hashedPassword = await bcrypt.hash(input.password, 12);

      return await this.prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          username: input.username,
          password: hashedPassword,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException("Username or email already exists");
      }

      throw new InternalServerErrorException("Failed to create user");
    }
    //# ADD BETTER ERROR HANDLING
  }

  async updateUser(input: UpdateUserInput, currentUserId: number) {
    // Require at least one field
    const hasAnyField =
      input.name !== undefined ||
      input.email !== undefined ||
      input.username !== undefined ||
      input.password !== undefined;

    if (!hasAnyField)
      throw new BadRequestException("No fields provided to update");

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
      const username = input.username.trim();
      if (!username) throw new BadRequestException("Username cannot be empty");
      data.username = username;
    }

    if (input.password !== undefined) {
      const pw = input.password.trim();
      if (!pw) throw new BadRequestException("Password cannot be empty");
      data.password = await bcrypt.hash(pw, 12);
    }

    return await this.prisma.user.update({
      where: { id: currentUserId },
      data,
    });
    //# ADD BETTER ERROR HANDLING
  }

  async deleteUser(currentUserId: number) {
    try {
      const result = await this.prisma.user.deleteMany({
        where: {
          id: currentUserId,
        },
      });

      return {
        message: "User deleted successfully",
      };
    } catch (err) {
      throw new InternalServerErrorException("Failed to delete user");
    }
  }
}
