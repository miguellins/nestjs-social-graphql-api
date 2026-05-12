import { Field, InputType } from "@nestjs/graphql";

import { IsBoolean, IsOptional } from "class-validator";

/** GraphQL input for partially updating the current user's notification preferences. */
@InputType()
export class UpdateNotificationPreferencesInput {
  /** Whether comment-reply notifications are enabled. */
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  replyNotificationsEnabled?: boolean;

  /** Whether follow-request notifications are enabled. */
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  followRequestNotificationsEnabled?: boolean;

  /** Whether post and comment mention notifications are enabled. */
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  mentionNotificationsEnabled?: boolean;

  /** Whether post-like notifications are enabled. */
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  postLikedNotificationsEnabled?: boolean;

  /** Whether new-follower notifications are enabled. */
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  userFollowedNotificationsEnabled?: boolean;
}
