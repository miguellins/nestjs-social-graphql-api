import {
  Args,
  Int,
  Mutation,
  Query,
  Resolver,
  Subscription,
} from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";
import { pubSub } from "@/graphql/pubsub";

import { FindNotificationsArgs } from "@/notifications/args/find-notifications.args";

import { NotificationsService } from "@/notifications/notifications.service";

import { NotificationDTO } from "@/notifications/models/notification.model";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { DeleteResponse } from "@/common/types/delete-response.type";

import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";

import type { GqlContext } from "@/app.module";

@Resolver(() => NotificationDTO)
export class NotificationsResolver {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => [NotificationDTO], { name: "myNotifications" })
  async findMyNotifications(
    @CurrentUser() user: { id: number },
    @Args() args: FindNotificationsArgs,
  ): Promise<NotificationDTO[]> {
    return this.notificationsService.findMyNotifications(
      user.id,
      args,
      args.status,
    );
  }

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => Int, { name: "unreadNotificationsCount" })
  async getUnreadNotificationsCount(
    @CurrentUser() user: { id: number },
  ): Promise<number> {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => DeleteResponse, { name: "markNotificationAsRead" })
  async markNotificationAsRead(
    @CurrentUser() user: { id: number },
    @Args("notificationId", { type: () => Int }) notificationId: number,
  ): Promise<DeleteResponse> {
    return this.notificationsService.markAsRead(notificationId, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => DeleteResponse, { name: "markAllNotificationsAsRead" })
  async markAllNotificationsAsRead(
    @CurrentUser() user: { id: number },
  ): Promise<DeleteResponse> {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Subscription(() => NotificationDTO, {
    name: "notificationReceived",
    filter: (
      payload: { notificationReceived: NotificationDTO },
      _variables: unknown,
      context: GqlContext,
    ) => {
      const reqUserId = (
        context.req as
          | (typeof context.req & {
              user?: { id?: number };
              extra?: { user?: { id?: number } };
            })
          | undefined
      )?.user?.id;

      const wsUserIdFromReq = (
        context.req as
          | (typeof context.req & {
              extra?: { user?: { id?: number } };
            })
          | undefined
      )?.extra?.user?.id;

      const subscriberId =
        context.extra?.user?.id ?? wsUserIdFromReq ?? reqUserId;

      return payload.notificationReceived.recipientId === subscriberId;
    },
  })
  notificationReceived() {
    return pubSub.asyncIterableIterator("notificationReceived");
  }
}
