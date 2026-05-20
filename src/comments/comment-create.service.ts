import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { runBestEffort } from "@/common/errors/run-best-effort";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";

import { CommentCacheService } from "@/comments/comment-cache.service";
import { CommentGuardsService } from "@/comments/comment-guards.service";
import { CommentsReadService } from "@/comments/comments-read.service";
import {
  type SafeCommentDTO,
  type SafeCommentRecord,
  SafeCommentSelect,
} from "@/comments/dto/safe-comment.dto";
import {
  createCommentCommandSchema,
  type CreateCommentCommand,
} from "@/comments/schemas/create-comment.schema";

import { COMMENT_REPLY_NOTIFICATION_DELIVERY_EVENT } from "@/outbox/events/comment-reply-notification-delivery.event";
import { OutboxService } from "@/outbox/outbox.service";

import { NotificationTriggerService } from "@/notifications/notification-trigger.service";
import { NotificationsService } from "@/notifications/notifications.service";

import { MentionsService } from "@/mentions/mentions.service";

import { NotificationType } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class CommentCreateService {
  private readonly logger = new Logger(CommentCreateService.name);
  private readonly outboxCommentRepliesEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly commentCacheService: CommentCacheService,
    private readonly commentGuardsService: CommentGuardsService,
    private readonly mentionsService: MentionsService,
    private readonly commentsReadService: CommentsReadService,
    private readonly notificationTrigger: NotificationTriggerService,
    private readonly notificationsService: NotificationsService,
    private readonly outboxService: OutboxService,
    configService: ConfigService,
  ) {
    this.outboxCommentRepliesEnabled =
      configService.get<boolean>("OUTBOX_COMMENT_REPLIED_ENABLED") ?? false;
  }

  async createComment(
    input: CreateCommentCommand,
    currentUserId: number,
  ): Promise<SafeCommentDTO> {
    await this.commentGuardsService.assertActiveCurrentUserById(currentUserId);
    const data = this.parseCreateCommentInput(input);
    this.mentionsService.validateCommentContentMentions(data.content);
    const post = await this.commentsReadService.getReadablePostOrThrow(
      data.postId,
      currentUserId,
    );

    let parentCommentAuthorId: number | undefined;
    if (data.parentCommentId !== undefined) {
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: data.parentCommentId },
        select: {
          id: true,
          postId: true,
          removedAt: true,
          parentCommentId: true,
          authorId: true,
        },
      });

      if (!parentComment) {
        throw new NotFoundException("Parent comment not found");
      }

      if (parentComment.removedAt) {
        throw new BadRequestException("Parent comment has been removed");
      }

      if (parentComment.postId !== data.postId) {
        throw new BadRequestException(
          "Parent comment does not belong to this post",
        );
      }

      if (parentComment.parentCommentId !== null) {
        throw new BadRequestException(
          "Replies can only target top-level comments",
        );
      }

      parentCommentAuthorId = parentComment.authorId;
    }

    const shouldPersistReplyNotificationInTransaction =
      this.outboxCommentRepliesEnabled &&
      parentCommentAuthorId !== undefined &&
      parentCommentAuthorId !== currentUserId;
    const replyRecipientId = shouldPersistReplyNotificationInTransaction
      ? parentCommentAuthorId
      : undefined;

    let replyActorUsername: string | undefined;
    if (shouldPersistReplyNotificationInTransaction) {
      const currentUser = await this.prisma.user.findUnique({
        where: { id: currentUserId },
        select: {
          username: true,
        },
      });

      replyActorUsername = currentUser?.username;
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const createdComment = await tx.comment.create({
        data: {
          content: data.content,
          postId: data.postId,
          authorId: currentUserId,
          parentCommentId: data.parentCommentId,
        },

        select: SafeCommentSelect,
      });

      await tx.post.update({
        where: { id: data.postId },

        data: {
          commentsCount: {
            increment: 1,
          },
        },
      });

      if (replyRecipientId !== undefined && replyActorUsername) {
        const notification = await this.notificationsService.createNotification(
          {
            recipientId: replyRecipientId,
            actorId: currentUserId,
            type: NotificationType.COMMENT_REPLIED,
            title: "New reply",
            body: `${replyActorUsername} replied to your comment`,
            entityId: createdComment.id,
          },
          tx,
        );

        if (notification) {
          await this.outboxService.enqueue(
            {
              eventType: COMMENT_REPLY_NOTIFICATION_DELIVERY_EVENT,
              aggregateType: "notification",
              aggregateId: notification.id,
              payload: {
                notificationId: notification.id,
                recipientId: notification.recipientId,
                actorId: notification.actorId,
                commentId: createdComment.id,
                notificationType: NotificationType.COMMENT_REPLIED,
              },
            },
            tx,
          );
        }
      }

      return createdComment;
    });

    await this.commentCacheService.invalidateAfterCreateComment(
      data.postId,
      post.authorId,
    );

    if (
      !this.outboxCommentRepliesEnabled &&
      parentCommentAuthorId !== undefined &&
      parentCommentAuthorId !== currentUserId
    ) {
      const currentUser = await this.prisma.user.findUnique({
        where: { id: currentUserId },
        select: {
          username: true,
        },
      });

      if (currentUser) {
        await runBestEffort(
          this.logger,
          "error",
          `Failed to create reply notification for comment ${comment.id}`,
          async () => {
            await this.notificationTrigger.notifyCommentReplied({
              recipientId: parentCommentAuthorId,
              actorId: currentUserId,
              actorUsername: currentUser.username,
              commentId: comment.id,
            });
          },
        );
      }
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to sync mentions after creating comment ${comment.id}`,
      async () => {
        await this.mentionsService.syncCommentMentions({
          commentId: comment.id,
          actorId: currentUserId,
          content: data.content,
        });
      },
    );

    return this.toCommentMutationResult(comment);
  }

  /** Parses and normalizes create-comment input with Zod, throws BadRequest on error. */
  private parseCreateCommentInput(input: CreateCommentCommand) {
    return parseWithBadRequest(
      createCommentCommandSchema,
      input,
      "Invalid comment input",
    );
  }

  /** Shapes one flat safe comment record into the mutation response contract used by GraphQL. */
  private toCommentMutationResult(comment: SafeCommentRecord): SafeCommentDTO {
    return {
      ...comment,
      repliesCount: 0,
      replies: [],
    };
  }
}
