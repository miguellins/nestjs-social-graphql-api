import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "src/prisma.service";

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async createFollow(input: { followerId: number; followingId: number }) {
    const { followerId, followingId } = input;

    if (followerId === followingId) {
      throw new BadRequestException("You cannot follow yourself");
    }

    const existing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId, followingId },
      },
    });

    if (existing) {
      throw new ConflictException("You already follow this user");
    }

    return this.prisma.follow.create({
      data: { followerId, followingId },
    });
  }

  async updateFollow(
    id: number,
    input: {
      followerId?: number;
      followingId?: number;
    },
  ) {
    const follow = await this.prisma.follow.findUnique({
      where: { id },
    });

    if (!follow) throw new NotFoundException("Follow not found");

    const data: any = {};

    if (input.followerId !== undefined) data.followerId = input.followerId;
    if (input.followingId !== undefined) data.followingId = input.followingId;

    try {
      return await this.prisma.follow.update({
        where: { id },
        data,
        include: {
          follower: true,
          following: true,
        },
      });
    } catch (err) {
      throw new Error(err.message);
    }
  }

  async deleteFollow(id: number) {
    const follow = await this.prisma.follow.findUnique({
      where: { id },
    });

    if (!follow) throw new NotFoundException("Follow not found");

    return this.prisma.follow.delete({
      where: { id },
    });
  }
}
