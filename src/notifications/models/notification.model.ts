import {
  Field,
  GraphQLISODateTime,
  Int,
  ObjectType,
  registerEnumType,
} from "@nestjs/graphql";

import { NotificationType } from "@prisma/client";

import { normalizeOutputTextMiddleware } from "@/graphql/middleware/normalize-output-text.middleware";
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

/** Notification entity delivered to a recipient user. */
@ObjectType()
export class NotificationDTO {
  /** Unique identifier of the notification record. */
  @Field(() => Int)
  id: number;

  /** Category of notification event. */
  @Field(() => NotificationType)
  type: NotificationType;

  /** Short title shown to the recipient. */
  @Field(() => String, {
    middleware: [normalizeOutputTextMiddleware],
  })
  title: string;

  /** Optional detailed message body. */
  body!: string | null;

  /** Read state of this notification. */
  isRead: boolean;

  /** Timestamp when notification was marked as read. */
  @Field(() => GraphQLISODateTime, {
    nullable: true,
  })
  readAt!: Date | null;

  /** Optional related entity id (follow, like, post, etc.). */
  @Field(() => Int, {
    nullable: true,
  })
  entityId!: number | null;

  /** Identifier of the user who triggered the notification. */
  @Field(() => Int)
  actorId: number;

  /** Identifier of the user who receives the notification. */
  @Field(() => Int)
  recipientId: number;

  /** Public-safe actor preview for UI rendering. */
  @Field(() => NotificationActorDTO)
  actor: NotificationActorDTO;

  /** Timestamp indicating when the notification was created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Timestamp indicating the latest update on this notification. */
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}
