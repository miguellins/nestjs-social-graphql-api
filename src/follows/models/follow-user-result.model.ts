import { Field, ID, ObjectType } from "@nestjs/graphql";

import { FollowRequestStatus } from "@/follows/enums/follow-request-status.enum";

/** Result returned after attempting to follow a user. */
@ObjectType()
export class FollowUserResult {
  /** Final outcome of the follow attempt. */
  @Field(() => FollowRequestStatus)
  status: FollowRequestStatus;

  /** Created follow id when the relationship was established immediately. */
  @Field(() => ID, { nullable: true })
  followId?: number;

  /** Follow request id when the target account requires approval. */
  @Field(() => ID, { nullable: true })
  followRequestId?: number;

  /** Optional human-readable summary of the outcome. */
  @Field({ nullable: true })
  message?: string;
}
