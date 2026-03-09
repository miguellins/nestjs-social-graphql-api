import {
  Field,
  GraphQLISODateTime,
  Int,
  ObjectType,
  registerEnumType,
} from "@nestjs/graphql";

import { NotificationType } from "@prisma/client";

import { NotificationActorDTO } from "@/notifications/models/notification-actor.model";

registerEnumType(NotificationType, {
  name: "NotificationType",
});

/**
 * GraphQL Object Type representing a user notification
 *
 * What it does:
 * - Defines the API contract used by notification queries/subscriptions
 * - Provides recipient-safe event metadata for client rendering
 * - Supports read state, timestamps, and optional related entity references
 *
 * Design philosophy:
 * - Notification objects should include enough context for UX
 * - Keep relational data minimal through dedicated preview objects
 *
 * Performance benefit:
 * - Flat scalar fields plus lightweight actor preview reduce payload cost
 * - Works well for polling and real-time subscription streams
 */

@ObjectType({
  description: "Notification entity delivered to a recipient user",
})
export class NotificationDTO {
  @Field(() => Int, {
    description: "Unique identifier of the notification record",
  })
  id: number;

  @Field(() => NotificationType, {
    description: "Category of notification event",
  })
  type: NotificationType;

  @Field(() => String, {
    description: "Short title shown to the recipient",
  })
  title: string;

  @Field(() => String, {
    nullable: true,
    description: "Optional detailed message body",
  })
  body!: string | null;

  @Field(() => Boolean, {
    description: "Read state of this notification",
  })
  isRead: boolean;

  @Field(() => GraphQLISODateTime, {
    nullable: true,
    description: "Timestamp when notification was marked as read",
  })
  readAt!: Date | null;

  @Field(() => Int, {
    nullable: true,
    description: "Optional related entity id (follow, like, post, etc.)",
  })
  entityId!: number | null;

  @Field(() => Int, {
    description: "Identifier of the user who triggered the notification",
  })
  actorId: number;

  @Field(() => Int, {
    description: "Identifier of the user who receives the notification",
  })
  recipientId: number;

  @Field(() => NotificationActorDTO, {
    description: "Public-safe actor preview for UI rendering",
  })
  actor: NotificationActorDTO;

  @Field(() => GraphQLISODateTime, {
    description: "Timestamp indicating when the notification was created",
  })
  createdAt: Date;

  @Field(() => GraphQLISODateTime, {
    description: "Timestamp indicating the latest update on this notification",
  })
  updatedAt: Date;
}
