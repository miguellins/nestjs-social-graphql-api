import { Injectable } from "@nestjs/common";

import { MessageResponse } from "@/common/types/message-response.type";

import type { CreatedPostDTO } from "@/posts/dto/created-post.dto";

import type { RepostPostPayload } from "@/reposts/models/repost-post-payload.model";
import type { CursorPageResult } from "@/common/pagination/cursor-pagination";

import { RepostReadService } from "@/reposts/repost-read.service";
import { RepostWriteService } from "@/reposts/repost-write.service";
import type { RepostListItem } from "@/reposts/models/repost-list-item.model";
import type { QuotePostCommand } from "@/reposts/schemas/repost-write.schema";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

@Injectable()
export class RepostsService {
  constructor(
    private readonly repostWriteService: RepostWriteService,
    private readonly repostReadService: RepostReadService,
  ) {}

  /** Delegates public repost-list reads to the read collaborator. */
  async findReposts(
    params: {
      after?: string;
      first?: number;
      orderBy?: import("@/common/enums/chronological-order.enum").ChronologicalOrder;
      postId: number;
    },
    viewer?: AuthenticatedUser,
  ): Promise<CursorPageResult<RepostListItem>> {
    return this.repostReadService.findReposts(params, viewer);
  }

  /** Delegates authenticated repost-list reads to the read collaborator. */
  async findMyReposts(
    currentUserId: number,
    params?: {
      after?: string;
      first?: number;
      orderBy?: import("@/common/enums/chronological-order.enum").ChronologicalOrder;
    },
  ): Promise<CursorPageResult<RepostListItem>> {
    return this.repostReadService.findMyReposts(currentUserId, params);
  }

  /** Delegates repost creation to the write collaborator. */
  async repostPost(
    currentUserId: number,
    postId: number,
  ): Promise<RepostPostPayload> {
    return this.repostWriteService.repostPost(currentUserId, postId);
  }

  /** Delegates repost removal to the write collaborator. */
  async undoRepost(
    currentUserId: number,
    postId: number,
  ): Promise<MessageResponse> {
    return this.repostWriteService.undoRepost(currentUserId, postId);
  }

  /** Delegates quote-post creation to the write collaborator. */
  async quotePost(
    currentUserId: number,
    input: QuotePostCommand,
  ): Promise<CreatedPostDTO> {
    return this.repostWriteService.quotePost(currentUserId, input);
  }
}
