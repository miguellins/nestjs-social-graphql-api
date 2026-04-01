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
}
