import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

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

  async createFollow(currentUserId: number, followingId: number) {
    const followerId = currentUserId;

    if (followerId === followingId) {
      throw new BadRequestException("You cannot follow yourself");
    }

    const existing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId, followingId },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("You already follow this user");
    }

    return this.prisma.follow.create({
      data: { followerId, followingId },
      include: {
        follower: true,
        following: true,
      },
    });
  }

  async deleteFollow(id: number, currentUserId: number) {
    const follow = await this.prisma.follow.findUnique({
      where: { id },
      select: {
        id: true,
        followerId: true,
      },
    });

    if (!follow) throw new NotFoundException("Follow not found");

    if (follow.followerId !== currentUserId) {
      throw new ForbiddenException(
        "You do not have permission to delete this follow",
      );
    }

    return this.prisma.follow.delete({
      where: { id },
      include: {
        follower: true,
        following: true,
      },
    });
  }
}
