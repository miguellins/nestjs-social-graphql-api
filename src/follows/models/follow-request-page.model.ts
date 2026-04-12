import { Field, ObjectType } from "@nestjs/graphql";

import { PageInfo } from "@/common/models/page-info.model";

import { FollowRequest } from "@/follows/models/follow-request.model";

/** Cursor-paginated page of follow requests plus navigation metadata. */
@ObjectType()
export class FollowRequestPage {
  /** Items returned for the current page. */
  @Field(() => [FollowRequest])
  items!: FollowRequest[];

  /** Cursor navigation metadata for the current page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}
