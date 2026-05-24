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

  /** Whether post-like notifications are enabled. */
  @Field(() => Boolean)
  postLikedNotificationsEnabled!: boolean;

  /** Whether post-repost notifications are enabled. */
  @Field(() => Boolean)
  postRepostedNotificationsEnabled!: boolean;

  /** Whether post-quote notifications are enabled. */
  @Field(() => Boolean)
  postQuotedNotificationsEnabled!: boolean;

  /** Whether new-follower notifications are enabled. */
  @Field(() => Boolean)
  userFollowedNotificationsEnabled!: boolean;
}
