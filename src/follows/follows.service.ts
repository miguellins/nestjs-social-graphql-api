import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import { PAGINATION } from "src/common/constants/hard-cap.constants";

import { SafeFollowDTO } from "./dto/safe-follow.dto";

import { PrismaService } from "src/prisma.service";

import { Prisma } from "@prisma/client";

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  async findFollows(params?: { take?: number }): Promise<SafeFollowDTO[]> {
    const take = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    return this.prisma.follow.findMany({
      take,
      orderBy: { id: "desc" },

      select: {
        id: true,
        createdAt: true,
        followerId: true,
        followingId: true,

        follower: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },

        following: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    });
  }

  async getFollow(id: number): Promise<SafeFollowDTO> {
    const follow = await this.prisma.follow.findUnique({
      where: { id },

      select: {
        id: true,
        createdAt: true,
        followerId: true,
        followingId: true,

        follower: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },

        following: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    });

    if (!follow) throw new NotFoundException("Follow not found");

    return follow;
  }

  async createFollow(
    currentUserId: number,
    followingId: number,
  ): Promise<SafeFollowDTO> {
    const followerId = currentUserId;

    // Business rule: cannot follow yourself
    if (followerId === followingId)
      throw new BadRequestException("You cannot follow yourself");

    const target = await this.prisma.user.findUnique({
      where: { id: followingId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException("User to follow not found");

    try {
      // Rely on @@unique([followerId, followingId]) to prevent duplicates safely
      return await this.prisma.follow.create({
        data: { followerId, followingId },

        select: {
          id: true,
          createdAt: true,
          followerId: true,
          followingId: true,

          follower: {
            select: { id: true, name: true, username: true },
          },
          following: {
            select: { id: true, name: true, username: true },
          },
        },
      });
    } catch (err) {
      // Duplicate follow attempt (unique constraint)
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002")
          throw new ConflictException("You already follow this user");

        // In case user was deleted between the check and create (race condition)
        if (err.code === "P2003" || err.code === "P2025")
          throw new NotFoundException("User to follow not found");
      }

      throw new InternalServerErrorException("Failed to create follow");
    }
  }

  async deleteFollow(id: number, currentUserId: number) {
    try {
      const existing = await this.prisma.follow.findUnique({
        where: { id },
        select: {
          id: true,
          followerId: true,
        },
      });

      if (!existing) throw new NotFoundException("Follow not found");
      if (existing.followerId !== currentUserId)
        throw new ForbiddenException(
          "You do not have permission to delete this follow",
        );

      await this.prisma.follow.delete({
        where: { id },
      });

      return {
        message: "Follow deleted successfully",
      };
    } catch (err) {
      // If it was deleted between check and delete (race condition)
      if (err instanceof Prisma.PrismaClientKnownRequestError)
        if (err.code === "P2025")
          throw new NotFoundException("Follow not found");

      // Keep domain errors
      if (err instanceof NotFoundException || err instanceof ForbiddenException)
        throw err;

      throw new InternalServerErrorException("Failed to delete follow");
    }
  }
}
