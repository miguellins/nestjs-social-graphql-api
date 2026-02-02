import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "src/prisma.service";

import { Prisma } from "@prisma/client";

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) { }

  async getAllFollows() {
    return this.prisma.follow.findMany({
      include: {
        follower: true,
        following: true,
      },
    });
  }

  async getFollow(id: number) {
    return this.prisma.follow.findUnique({
      where: { id },
      include: {
        follower: true,
        following: true,
      },
    });
  }

  async createFollow(input: {
    followerId: number;
    followingId: number;
  }) {
    const { followerId, followingId } = input;

    if (followerId === followingId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    const existing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId, followingId },
      },
    });

    if (existing) {
      throw new ConflictException('You already follow this user');
    }

    return this.prisma.follow.create({
      data: { followerId, followingId },
      include: { follower: true, following: true },
    });
  }

  /*
  async updateUser(
    id: number,
    input: {
      name?: string;
      email?: string;
      username?: string;
      password?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        posts: true,
        likes: { include: { post: true } },
        //followers: { include: { following: true } },
        //following: { include: { follower: true } },
      },
    });

    if (!user) throw new NotFoundException("User not found");

    const data: any = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.username !== undefined) data.username = input.username;

    if (input.password !== undefined) {
      data.password = await bcrypt.hash(input.password, 12);
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        include: {
          posts: true,
          likes: { include: { post: true } },
          //followers: { include: { following: true } },
          //following: { include: { follower: true } },
        },
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

      throw new InternalServerErrorException("Failed to update user");
    }
  }

  async deleteUser(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        posts: true,
        likes: { include: { post: true } },
        //followers: { include: { following: true } },
        //following: { include: { follower: true } },
      },
    });

    if (!user) throw new NotFoundException("User not found");

    return this.prisma.user.delete({
      where: { id },
      include: {
        posts: true,
        likes: { include: { post: true } },
        //followers: { include: { following: true } },
        //following: { include: { follower: true } },
      },
    });
  }
    */
}
