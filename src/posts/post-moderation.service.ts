import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { MessageResponse } from "@/common/types/message-response.type";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";

import { PostCacheService } from "@/posts/post-cache.service";
import {
  removePostByModeratorCommandSchema,
  type RemovePostByModeratorCommand,
} from "@/posts/schemas/remove-post-by-moderator.schema";

import {
  HashtagsService,
  type HashtagSyncResult,
} from "@/hashtags/hashtags.service";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { AccountState } from "@/users/enums/account-state.enum";
import { MODERATION_ROLE_SET } from "@/users/enums/user-role.enum";

import { PrismaService } from "@/prisma/prisma.service";

import { Prisma } from "@prisma/client";

@Injectable()
export class PostModerationService {
  private readonly logger = new Logger(PostModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly postCacheService: PostCacheService,
    private readonly hashtagsService: HashtagsService,
  ) {}

  /** Removes a post through the moderation workflow while preserving audit and cache behavior. */
  async removePostByModerator(
    input: RemovePostByModeratorCommand,
    currentUser: AuthenticatedUser,
  ): Promise<MessageResponse> {
    await this.assertActiveCurrentUserById(currentUser.id);
    this.assertCanModerateContent(currentUser);

    const data = this.parseRemovePostByModeratorInput(input);

    const existing = await this.prisma.post.findUnique({
      where: { id: data.postId },
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

    if (!existing) {
      throw new NotFoundException("Post not found");
    }

    if (existing.removedAt) {
      throw new BadRequestException("Post has already been removed");
    }

    let hashtagSync: HashtagSyncResult = {
      changed: false,
      publicCountChanged: false,
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        const removal = await tx.post.updateMany({
          where: {
            id: data.postId,
            removedAt: null,
          },
          data: {
            removedAt: new Date(),
            removedById: currentUser.id,
            removalReason: data.reason,
          },
        });

        if (removal.count === 0) {
          throw new BadRequestException("Post has already been removed");
        }

        hashtagSync = await this.hashtagsService.stripPostHashtags({
          tx,
          postId: data.postId,
          publiclyCountable:
            this.hashtagsService.isPubliclyCountablePost(existing),
        });

        if (data.reportId !== undefined) {
          const linkedReport = await tx.contentReport.updateMany({
            where: {
              id: data.reportId,
              postId: data.postId,
              status: "OPEN",
            },
            data: {
              status: "ACTIONED",
            },
          });

          if (linkedReport.count === 0) {
            throw new BadRequestException(
              "Linked report is not open for this post",
            );
          }
        }

        await tx.moderationAction.create({
          data: {
            actorId: currentUser.id,
            actionType: "REMOVE_POST",
            targetType: "POST",
            targetId: data.postId,
            reason: data.reason,
            reportId: data.reportId,
            postId: data.postId,
          },
        });
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;

      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        throw new NotFoundException("Post not found");
      }

      this.throwUnexpectedPersistenceFailure("remove post by moderator", err);
    }

    await this.postCacheService.invalidateAfterModeratorRemovePost(
      data.postId,
      existing.authorId,
      hashtagSync.publicCountChanged,
    );

    return {
      message: "Post removed successfully",
    };
  }

  /** Parses and normalizes moderator/admin post-removal input. */
  private parseRemovePostByModeratorInput(input: RemovePostByModeratorCommand) {
    return parseWithBadRequest(
      removePostByModeratorCommandSchema,
      input,
      "Invalid moderator post removal input",
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

  /** Logs and throws a sanitized internal server error for unexpected persistence failures. */
  private throwUnexpectedPersistenceFailure(
    action: "remove post by moderator",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  /** Ensures authenticated post moderation cannot be performed by disabled accounts. */
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
      throw new ForbiddenException("This account is suspended");
    }

    if (user.accountState === AccountState.DEACTIVATED) {
      throw new NotFoundException("Current user not found");
    }
  }
}
