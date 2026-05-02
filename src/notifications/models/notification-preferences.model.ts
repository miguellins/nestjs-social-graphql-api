import { Field, ObjectType } from "@nestjs/graphql";

/** User-level notification preference toggles. */
@ObjectType()
export class NotificationPreferences {
  /** Whether comment-reply notifications are enabled. */
  @Field(() => Boolean)
  replyNotificationsEnabled!: boolean;

  /** Whether follow-request notifications are enabled. */
  @Field(() => Boolean)
  followRequestNotificationsEnabled!: boolean;

  /** Whether post and comment mention notifications are enabled. */
  @Field(() => Boolean)
  mentionNotificationsEnabled!: boolean;
}
