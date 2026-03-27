import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
  registerEnumType,
} from "@nestjs/graphql";

import { normalizeOutputTextMiddleware } from "@/graphql/middleware/normalize-output-text.middleware";
import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { NotificationActorDTO } from "@/notifications/models/notification-actor.model";

import { NotificationType } from "@prisma/client";

registerEnumType(NotificationType, {
  name: "NotificationType",
});

/**
 * GraphQL model for notifications
 *
 * Exposes the public notification fields returned by the API
 */

/** Notification entity delivered to a recipient user. */
@ObjectType()
export class NotificationDTO {
  /** Unique identifier of the notification record. */
  @Field(() => ID)
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

  /** Presentation-friendly UTC timestamp for UI display. */
  @FormattedDateTimeField("readAt", {
    nullable: true,
    description:
      "Presentation-friendly UTC timestamp for when the notification was marked as read.",
  })
  readAtFormatted?: string | null;

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

  /** Presentation-friendly UTC timestamp for UI display. */
  @FormattedDateTimeField("createdAt", {
    description:
      "Presentation-friendly UTC timestamp for when the notification was created.",
  })
  createdAtFormatted?: string;

  /** Timestamp indicating the latest update on this notification. */
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  /** Presentation-friendly UTC timestamp for UI display. */
  @FormattedDateTimeField("updatedAt", {
    description:
      "Presentation-friendly UTC timestamp for when the notification was last updated.",
  })
  updatedAtFormatted?: string;
}
