import { Injectable } from "@nestjs/common";

import { NotificationsService } from "@/notifications/notifications.service";

import { NotificationType } from "@prisma/client";

@Injectable()
export class NotificationTriggerService {
  constructor(private readonly notificationsService: NotificationsService) {}

  // Creates the standard notification for a liked post
  async notifyPostLiked(params: {
    recipientId: number;
    actorId: number;
    actorUsername: string;
    postId: number;
  }): Promise<void> {
    await this.notificationsService.createAndPublishNotification({
      recipientId: params.recipientId,
      actorId: params.actorId,
      type: NotificationType.POST_LIKED,
      title: "New like",
      body: `${params.actorUsername} liked your post`,
      entityId: params.postId,
    });
  }

  // Creates the standard notification for a new follower
  async notifyUserFollowed(params: {
    recipientId: number;
    actorId: number;
    actorUsername: string;
    followId: number;
  }): Promise<void> {
    await this.notificationsService.createAndPublishNotification({
      recipientId: params.recipientId,
      actorId: params.actorId,
      type: NotificationType.USER_FOLLOWED,
      title: "New follower",
      body: `${params.actorUsername} started following you`,
      entityId: params.followId,
    });
  }

  // Creates the standard notification for a new private-account follow request
  async notifyFollowRequested(params: {
    recipientId: number;
    actorId: number;
    actorUsername: string;
    followRequestId: number;
  }): Promise<void> {
    await this.notificationsService.createAndPublishNotification({
      recipientId: params.recipientId,
      actorId: params.actorId,
      type: NotificationType.FOLLOW_REQUESTED,
      title: "New follow request",
      body: `${params.actorUsername} requested to follow you`,
      entityId: params.followRequestId,
    });
  }

  // Creates the standard notification for a reply to one comment
  async notifyCommentReplied(params: {
    recipientId: number;
    actorId: number;
    actorUsername: string;
    commentId: number;
  }): Promise<void> {
    await this.notificationsService.createAndPublishNotification({
      recipientId: params.recipientId,
      actorId: params.actorId,
      type: NotificationType.COMMENT_REPLIED,
      title: "New reply",
      body: `${params.actorUsername} replied to your comment`,
      entityId: params.commentId,
    });
  }

  // Creates the standard notification for a user mentioned in a post
  async notifyPostMentioned(params: {
    recipientId: number;
    actorId: number;
    actorUsername: string;
    postId: number;
  }): Promise<void> {
    await this.notificationsService.createAndPublishNotification({
      recipientId: params.recipientId,
      actorId: params.actorId,
      type: NotificationType.POST_MENTIONED,
      title: "Mentioned in a post",
      body: `${params.actorUsername} mentioned you in a post`,
      entityId: params.postId,
    });
  }

  // Creates the standard notification for a user mentioned in a comment
  async notifyCommentMentioned(params: {
    recipientId: number;
    actorId: number;
    actorUsername: string;
    commentId: number;
  }): Promise<void> {
    await this.notificationsService.createAndPublishNotification({
      recipientId: params.recipientId,
      actorId: params.actorId,
      type: NotificationType.COMMENT_MENTIONED,
      title: "Mentioned in a comment",
      body: `${params.actorUsername} mentioned you in a comment`,
      entityId: params.commentId,
    });
  }
}
