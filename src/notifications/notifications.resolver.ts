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
import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";

import { UpdateNotificationPreferencesInput } from "@/notifications/dto/update-notification-preferences.input";
import { NotificationPreferencesService } from "@/notifications/notification-preferences.service";
import { NotificationActorPreferencesService } from "@/notifications/notification-actor-preferences.service";
import { buildNotificationReceivedTrigger } from "@/notifications/notification-delivery.service";
import { NotificationPreferences } from "@/notifications/models/notification-preferences.model";
import { FindNotificationsArgs } from "@/notifications/args/find-notifications.args";
import { NotificationPage } from "@/notifications/models/notification-page.model";
import { NotificationsService } from "@/notifications/notifications.service";
import { NotificationDTO } from "@/notifications/models/notification.model";
import { SilencedActorEdge } from "@/notifications/models/silenced-actor-edge.model";
import { SilencedActorPage } from "@/notifications/models/silenced-actor-page.model";
import { UserInteractionPreferences } from "@/notifications/models/user-interaction-preferences.model";

import { GraphqlPubSubService } from "@/graphql/subscriptions/graphql-pubsub.service";
import type { GqlContext } from "@/graphql/config/graphql-context.types";
import { MutesService } from "@/mutes/mutes.service";

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
    private readonly notificationPreferences: NotificationPreferencesService,
    private readonly actorPreferences: NotificationActorPreferencesService,
    private readonly mutesService: MutesService,
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

  @Throttle({ default: THROTTLE_LIMITS.READ })
  @Query(() => NotificationPreferences, { name: "myNotificationPreferences" })
  async myNotificationPreferences(
    @CurrentUser() user: { id: number },
  ): Promise<NotificationPreferences> {
    return this.notificationPreferences.getMyPreferences(user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.READ })
  @Query(() => UserInteractionPreferences, { name: "myInteractionPreferences" })
  async myInteractionPreferences(
    @CurrentUser() user: { id: number },
    @Args("mutedFirst", { type: () => Int, nullable: true })
    mutedFirst?: number,
    @Args("mutedAfter", { type: () => String, nullable: true })
    mutedAfter?: string,
    @Args("silencedFirst", { type: () => Int, nullable: true })
    silencedFirst?: number,
    @Args("silencedAfter", { type: () => String, nullable: true })
    silencedAfter?: string,
  ): Promise<UserInteractionPreferences> {
    return {
      notificationPreferences:
        await this.notificationPreferences.getMyPreferences(user.id),
      mutedUsers: await this.mutesService.findMyMutedUsers(user.id, {
        first: mutedFirst,
        after: mutedAfter,
      }),
      silencedActors: await this.actorPreferences.findMySilencedActors(
        user.id,
        {
          first: silencedFirst,
          after: silencedAfter,
        },
      ),
    };
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => NotificationPreferences, {
    name: "updateNotificationPreferences",
  })
  async updateNotificationPreferences(
    @CurrentUser() user: { id: number },
    @Args("input") input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferences> {
    return this.notificationPreferences.updateMyPreferences(user.id, input);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => SilencedActorEdge, {
    name: "silenceNotificationsFromActor",
  })
  async silenceNotificationsFromActor(
    @CurrentUser() user: { id: number },
    @Args("actorId", { type: () => Int }) actorId: number,
  ): Promise<SilencedActorEdge> {
    return this.actorPreferences.silenceActor(user.id, actorId);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => Boolean, {
    name: "unsilenceNotificationsFromActor",
  })
  async unsilenceNotificationsFromActor(
    @CurrentUser() user: { id: number },
    @Args("actorId", { type: () => Int }) actorId: number,
  ): Promise<boolean> {
    return this.actorPreferences.unsilenceActor(user.id, actorId);
  }

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => SilencedActorPage, { name: "mySilencedNotificationActors" })
  async mySilencedNotificationActors(
    @CurrentUser() user: { id: number },
    @Args() args: CursorPaginationArgs,
  ): Promise<SilencedActorPage> {
    return this.actorPreferences.findMySilencedActors(user.id, args);
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
