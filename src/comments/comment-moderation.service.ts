import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";

import {
  removeCommentByModeratorCommandSchema,
  type RemoveCommentByModeratorCommand,
} from "@/comments/schemas/remove-comment-by-moderator.schema";

import { MODERATION_ROLE_SET } from "@/users/enums/user-role.enum";
import { AccountState } from "@/users/enums/account-state.enum";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class CommentModerationService {
  private readonly logger = new Logger(CommentModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
  ) {}

  async removeCommentByModerator(
    input: RemoveCommentByModeratorCommand,
    currentUser: AuthenticatedUser,
  ): Promise<MessageResponse> {
    await this.assertActiveCurrentUserById(currentUser.id);
    this.assertCanModerateContent(currentUser);

    const data = this.parseRemoveCommentByModeratorInput(input);

    const existing = await this.prisma.comment.findUnique({
      where: { id: data.commentId },
      select: {
        id: true,
        postId: true,
        parentCommentId: true,
        removedAt: true,
        post: {
          select: {
            authorId: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException("Comment not found");
    }

    if (existing.removedAt) {
      throw new BadRequestException("Comment has already been removed");
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const removal = await tx.comment.updateMany({
          where: {
            ...(existing.parentCommentId === null
              ? {
                  OR: [
                    { id: data.commentId },
                    { parentCommentId: data.commentId },
                  ],
                }
              : {
                  id: data.commentId,
                }),
            removedAt: null,
          },
          data: {
            removedAt: new Date(),
            removedById: currentUser.id,
            removalReason: data.reason,
          },
        });

        if (removal.count === 0) {
          throw new BadRequestException("Comment has already been removed");
        }

        await tx.post.update({
          where: { id: existing.postId },
          data: {
            commentsCount: {
              decrement: removal.count,
            },
          },
        });

        if (data.reportId !== undefined) {
          const linkedReport = await tx.contentReport.updateMany({
            where: {
              id: data.reportId,
              commentId: data.commentId,
              status: "OPEN",
            },
            data: {
              status: "ACTIONED",
            },
          });

          if (linkedReport.count === 0) {
            throw new BadRequestException(
              "Linked report is not open for this comment",
            );
          }
        }

        await tx.moderationAction.create({
          data: {
            actorId: currentUser.id,
            actionType: "REMOVE_COMMENT",
            targetType: "COMMENT",
            targetId: data.commentId,
            reason: data.reason,
            reportId: data.reportId,
            commentId: data.commentId,
          },
        });
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;

      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        throw new NotFoundException("Comment not found");
      }

      this.throwUnexpectedPersistenceFailure(
        "remove comment by moderator",
        err,
      );
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after moderator removed comment ${data.commentId}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${existing.postId}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          `v:user:${existing.post.authorId}:posts:list`,
        );
      },
    );

    return {
      message: "Comment removed successfully",
    };
  }

  /** Parses and normalizes moderator/admin comment-removal input with Zod. */
  private parseRemoveCommentByModeratorInput(
    input: RemoveCommentByModeratorCommand,
  ) {
    return parseWithBadRequest(
      removeCommentByModeratorCommandSchema,
      input,
      "Invalid moderator comment removal input",
    );
  }

  /** Enforces that only moderators/admins can perform moderation actions. */
  private assertCanModerateContent(user: AuthenticatedUser): void {
    if (!user.role || !MODERATION_ROLE_SET.has(user.role)) {
      throw new ForbiddenException(
        "You do not have permission to moderate content",
      );
    }
  }

  /** Enforces active-account status for authenticated comment operations. */
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

  /** Logs and throws InternalServerErrorException for unexpected persistence errors. */
  private throwUnexpectedPersistenceFailure(
    action: "remove comment by moderator",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}
