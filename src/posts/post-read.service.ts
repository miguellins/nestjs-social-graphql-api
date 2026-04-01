import { Injectable, NotFoundException } from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { PAGINATION } from "@/common/constants/hard-cap.constants";

import {
  type SafePostDetailDTO,
  SafePostDetailSelect,
} from "@/posts/dto/safe-post-detail.dto";

import { MediaReadProjectionService } from "@/media/media-read-projection.service";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

/**
 * Feature-private post read helpers
 *
 * Owns detailed post reads and cached view-count refresh behavior
 */

@Injectable()
export class PostReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly mediaReadProjection: MediaReadProjectionService,
  ) {}

  // Returns one detailed post view with bounded likes and comments
  async getPostDetail(id: number): Promise<SafePostDetailDTO> {
    const likesTake = Math.min(
      PAGINATION.DEFAULT_TAKE_LIKES,
      PAGINATION.MAX_TAKE_LIKES,
    );

    const commentsTake = Math.min(PAGINATION.DEFAULT_TAKE, PAGINATION.MAX_TAKE);

    const post = await this.prisma.post.findUnique({
      where: { id },
      select: {
        ...SafePostDetailSelect,

        likes: {
          take: likesTake,
          orderBy: {
            createdAt: "desc",
          },
          select: SafePostDetailSelect.likes.select,
        },

        comments: {
          take: commentsTake,
          orderBy: {
            createdAt: "desc",
          },
          select: SafePostDetailSelect.comments.select,
        },
      },
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    return this.mediaReadProjection.derivePostDetailMediaUrls(post);
  }

  // Increments the view counter and refreshes the cached detail when present
  async incrementPostViewsCount(
    id: number,
    cacheKey: string,
    detailCacheTtlMs: number,
  ): Promise<void> {
    let updatedPost: { viewsCount: number };

    try {
      updatedPost = await this.prisma.post.update({
        where: { id },
        data: {
          viewsCount: {
            increment: 1,
          },
        },
        select: {
          viewsCount: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        return;
      }

      throw err;
    }

    const cachedPost = await this.cacheHelper.get<SafePostDetailDTO>(cacheKey);

    if (!cachedPost) {
      return;
    }

    await this.cacheHelper.set(
      cacheKey,
      {
        ...cachedPost,
        viewsCount: updatedPost.viewsCount,
      },
      detailCacheTtlMs,
    );
  }
}
