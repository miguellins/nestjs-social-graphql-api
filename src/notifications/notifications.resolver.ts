import {
  Args,
  Context,
  Int,
  Mutation,
  Query,
  Resolver,
  Subscription,
} from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";

import { buildNotificationReceivedTrigger } from "@/notifications/notification-delivery.service";
import { FindNotificationsArgs } from "@/notifications/args/find-notifications.args";
import { NotificationPage } from "@/notifications/models/notification-page.model";
import { NotificationsService } from "@/notifications/notifications.service";
import { NotificationDTO } from "@/notifications/models/notification.model";

import { GraphqlPubSubService } from "@/graphql/subscriptions/graphql-pubsub.service";
import type { GqlContext } from "@/graphql/config/graphql-context.types";

type SubscriptionContextUserCarrier = {
  id?: unknown;
};

type NotificationSubscriptionContext =
  | GqlContext
  | {
      user?: SubscriptionContextUserCarrier;
      extra?: {
        user?: SubscriptionContextUserCarrier;
      };
      req?: {
        user?: SubscriptionContextUserCarrier;
      };
      connectionParams?: {
        user?: SubscriptionContextUserCarrier;
      };
    };

function getSubscriptionContextUserId(
  context: NotificationSubscriptionContext,
): number | undefined {
  const userCandidates = [
    context.extra?.user,
    context.req?.user,
    "user" in context ? context.user : undefined,
    "connectionParams" in context ? context.connectionParams?.user : undefined,
  ];

  for (const candidate of userCandidates) {
    if (!isSubscriptionContextUserCarrier(candidate)) continue;
    if (typeof candidate.id === "number") return candidate.id;
  }

  return undefined;
}

function isSubscriptionContextUserCarrier(
  value: unknown,
): value is SubscriptionContextUserCarrier {
  return typeof value === "object" && value !== null;
}

@Resolver(() => NotificationDTO)
export class NotificationsResolver {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly graphqlPubSub: GraphqlPubSubService,
  ) {}

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => NotificationPage, { name: "myNotifications" })
  async findMyNotifications(
    @CurrentUser() user: { id: number },
    @Args() args: FindNotificationsArgs,
  ): Promise<NotificationPage> {
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
  @Mutation(() => MessageResponse, { name: "markNotificationAsRead" })
  async markNotificationAsRead(
    @CurrentUser() user: { id: number },
    @Args("notificationId", { type: () => Int }) notificationId: number,
  ): Promise<MessageResponse> {
    return this.notificationsService.markAsRead(notificationId, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "markAllNotificationsAsRead" })
  async markAllNotificationsAsRead(
    @CurrentUser() user: { id: number },
  ): Promise<MessageResponse> {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Subscription(() => NotificationDTO, {
    name: "notificationReceived",
  })
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  notificationReceived(@Context() context: NotificationSubscriptionContext) {
    const subscriberId = getSubscriptionContextUserId(context);

    if (subscriberId === undefined) {
      throw new Error("Unauthorized");
    }

    return this.graphqlPubSub.asyncIterableIterator(
      buildNotificationReceivedTrigger(subscriberId),
    );
  }
}
