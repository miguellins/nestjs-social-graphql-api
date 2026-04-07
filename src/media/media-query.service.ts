import { Injectable, NotFoundException } from "@nestjs/common";

import { decodeChronoCursor } from "@/common/pagination/chrono-cursor";
import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import {
  buildChronologicalCursorFilter,
  buildCursorPage,
  normalizeCursorTake,
  type CursorPageResult,
} from "@/common/pagination/cursor-pagination";

import { MediaReadProjectionService } from "@/media/media-read-projection.service";
import { type SafeMediaDTO, SafeMediaSelect } from "@/media/dto/safe-media.dto";

import {
  type SafeAttachMediaPostDTO,
  SafeAttachMediaPostSelect,
} from "@/posts/dto/safe-attach-media-post.dto";

import { PrismaService } from "@/prisma/prisma.service";

export type MediaPaginationParams = {
  after?: string;
  first?: number;
  orderBy?: ChronologicalOrder;
};

@Injectable()
export class MediaQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaReadProjection: MediaReadProjectionService,
  ) {}

  async myMedia(
    currentUserId: number,
    params?: MediaPaginationParams,
  ): Promise<CursorPageResult<SafeMediaDTO>> {
    const take = normalizeCursorTake(params?.first);
    const orderBy = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderBy);

    const media = await this.prisma.media.findMany({
      where: cursorFilter
        ? {
            AND: [{ ownerId: currentUserId }, cursorFilter],
          }
        : {
            ownerId: currentUserId,
          },
      take: take + 1,

      orderBy: [
        { createdAt: toSortDirection(orderBy) },
        { id: toSortDirection(orderBy) },
      ],

      select: SafeMediaSelect,
    });

    return buildCursorPage(
      media.map((item) => this.mediaReadProjection.derivePublicUrl(item)),
      take,
    );
  }

  async getAttachMediaPostResult(
    postId: number,
  ): Promise<SafeAttachMediaPostDTO> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },

      select: SafeAttachMediaPostSelect,
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    return this.mediaReadProjection.deriveAttachMediaPostUrls(post);
  }
}
