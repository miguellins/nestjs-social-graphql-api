import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { FollowRequestStatus } from "@/follows/enums/follow-request-status.enum";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

/** Core representation of a FollowRequest entity for private-account approval flows. */
@ObjectType()
export class FollowRequest {
  /** Unique identifier of the follow request record. */
  @Field(() => ID)
  id: number;

  /** Current review state of the follow request. */
  @Field(() => FollowRequestStatus)
  status: FollowRequestStatus;

  /** Timestamp indicating when the follow request was originally created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for when the follow request was originally created. */
  @FormattedDateTimeField("createdAt")
  createdAtFormatted?: string;

  /** Public safe preview of the user who initiated the follow request. */
  @Field(() => SafeUserPreview)
  requester: SafeUserPreview;

  /** Public safe preview of the target user who must approve or reject the request. */
  @Field(() => SafeUserPreview)
  targetUser: SafeUserPreview;
}
