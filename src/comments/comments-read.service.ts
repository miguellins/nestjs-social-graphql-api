import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";
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

import {
  type SafeCommentDTO,
  type SafeCommentRecord,
  type SafeCommentReplyDTO,
  SafeCommentSelect,
} from "@/comments/dto/safe-comment.dto";

import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { AccountState } from "@/users/enums/account-state.enum";

import { MutesService } from "@/mutes/mutes.service";

import { PrismaService } from "@/prisma/prisma.service";

type FindCommentsByPostParams = {
  after?: string;
  first?: number;
  postId: number;
  orderBy?: ChronologicalOrder;
  viewerId?: number;
};

type ReadablePost = {
  id: number;
  authorId: number;
  removedAt: Date | null;
  author: {
    accountState: AccountState;
    privacySetting: UserPrivacySetting;
  };
};

const INLINE_REPLIES_LIMIT = 3;

@Injectable()
export class CommentsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mutesService: MutesService,
  ) {}

  async findCommentsByPost({
    after,
    first,
    postId,
    orderBy,
    viewerId,
  }: FindCommentsByPostParams): Promise<CursorPageResult<SafeCommentDTO>> {
    if (viewerId !== undefined) {
      await this.assertActiveCurrentUserById(viewerId);
    }

    await this.getReadablePostOrThrow(postId, viewerId);

    const normalizedTake = normalizeCursorTake(first);
    const orderby = orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = after ? decodeChronoCursor(after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderby);
    const mutedAuthorIds =
      viewerId !== undefined
        ? await this.mutesService.getMutedUserIds(viewerId)
        : [];

    const rows = await this.prisma.comment.findMany({
      take: normalizedTake + 1,
      where: cursorFilter
        ? {
            AND: [
              {
                postId,
                parentCommentId: null,
                removedAt: null,
                ...(mutedAuthorIds.length > 0
                  ? { authorId: { notIn: mutedAuthorIds } }
                  : {}),
              },
              cursorFilter,
            ],
          }
        : {
            postId,
            parentCommentId: null,
            removedAt: null,
            ...(mutedAuthorIds.length > 0
              ? { authorId: { notIn: mutedAuthorIds } }
              : {}),
          },
      orderBy: [
        { createdAt: toSortDirection(orderby) },
        { id: toSortDirection(orderby) },
      ],
      select: SafeCommentSelect,
    });

    const page = buildCursorPage(rows, normalizedTake);

    return {
      items: await this.attachReplies(page.items, mutedAuthorIds),
      pageInfo: page.pageInfo,
    };
  }

  async listThreadedCommentsForPost(
    postId: number,
    viewerId: number | null | undefined,
    take: number,
    orderBy: ChronologicalOrder = ChronologicalOrder.NEWEST,
  ): Promise<SafeCommentDTO[]> {
    await this.getReadablePostOrThrow(postId, viewerId);
    const mutedAuthorIds =
      viewerId !== undefined && viewerId !== null
        ? await this.mutesService.getMutedUserIds(viewerId)
        : [];

    const rows = await this.prisma.comment.findMany({
      take,
      where: {
        postId,
        parentCommentId: null,
        removedAt: null,
        ...(mutedAuthorIds.length > 0
          ? { authorId: { notIn: mutedAuthorIds } }
          : {}),
      },
      orderBy: [
        { createdAt: toSortDirection(orderBy) },
        { id: toSortDirection(orderBy) },
      ],
      select: SafeCommentSelect,
    });

    return this.attachReplies(rows, mutedAuthorIds);
  }

  async getReadablePostOrThrow(
    postId: number,
    viewerId?: number | null,
  ): Promise<ReadablePost> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        authorId: true,
        removedAt: true,
        author: {
          select: {
            accountState: true,
            privacySetting: true,
          },
        },
      },
    });

    if (
      !post ||
      post.removedAt ||
      post.author.accountState === AccountState.DEACTIVATED
    ) {
      throw new NotFoundException("Post not found");
    }

    if (!(await this.canViewerReadPostContent(viewerId, post))) {
      throw new NotFoundException("Post not found");
    }

    return post;
  }

  /** Attaches bounded inline replies to each root comment while preserving reply counts. */
  private async attachReplies(
    parents: SafeCommentRecord[],
    mutedAuthorIds: number[],
  ): Promise<SafeCommentDTO[]> {
    if (parents.length === 0) {
      return [];
    }

    const parentIds = parents.map((parent) => parent.id);
    const replyRows = await this.prisma.comment.findMany({
      where: {
        parentCommentId: {
          in: parentIds,
        },
        removedAt: null,
        ...(mutedAuthorIds.length > 0
          ? { authorId: { notIn: mutedAuthorIds } }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: SafeCommentSelect,
    });

    const repliesByParentId = new Map<number, SafeCommentRecord[]>();

    for (const reply of replyRows) {
      if (reply.parentCommentId === null) continue;
      const existing = repliesByParentId.get(reply.parentCommentId) ?? [];
      existing.push(reply);
      repliesByParentId.set(reply.parentCommentId, existing);
    }

    return parents.map((parent) => {
      const threadReplies = repliesByParentId.get(parent.id) ?? [];
      const replies = threadReplies
        .slice(0, INLINE_REPLIES_LIMIT)
        .map((reply) => this.toReplyDTO(reply));

      return {
        ...parent,
        repliesCount: threadReplies.length,
        replies,
      };
    });
  }

  /** Projects a full safe comment record into the nested reply DTO shape. */
  private toReplyDTO(reply: SafeCommentRecord): SafeCommentReplyDTO {
    return reply;
  }

  /** Ensures the current viewer account exists and can perform comment reads. */
  private async assertActiveCurrentUserById(
    currentUserId: number,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        accountState: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Current user not found");
    }

    if (user.accountState === AccountState.SUSPENDED) {
      throw new UnauthorizedException({
        message: "This account is suspended",
        code: GRAPHQL_ERROR_CODES.ACCOUNT_SUSPENDED,
      });
    }

    if (user.accountState === AccountState.DEACTIVATED) {
      throw new UnauthorizedException({
        message: "This account is deactivated",
        code: GRAPHQL_ERROR_CODES.ACCOUNT_DEACTIVATED,
      });
    }
  }

  /** Checks whether the viewer can read a post's comment surface. */
  private async canViewerReadPostContent(
    viewerId: number | undefined | null,
    post: {
      authorId: number;
      author: {
        privacySetting: UserPrivacySetting;
      };
    },
  ): Promise<boolean> {
    if (viewerId === post.authorId) {
      return true;
    }

    if (!viewerId) {
      return post.author.privacySetting === UserPrivacySetting.PUBLIC;
    }

    const blockRelationship = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          {
            blockerId: viewerId,
            blockedId: post.authorId,
          },
          {
            blockerId: post.authorId,
            blockedId: viewerId,
          },
        ],
      },
      select: { id: true },
    });

    if (blockRelationship) {
      return false;
    }

    if (await this.mutesService.isMuted(viewerId, post.authorId)) {
      return false;
    }

    if (post.author.privacySetting === UserPrivacySetting.PUBLIC) {
      return true;
    }

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewerId,
          followingId: post.authorId,
        },
      },
      select: { id: true },
    });

    return Boolean(follow);
  }
}
