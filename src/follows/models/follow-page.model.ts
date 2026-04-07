import { Field, ObjectType } from "@nestjs/graphql";

import { PageInfo } from "@/common/models/page-info.model";

import { Follow } from "@/follows/models/follow.model";

/** Cursor-paginated page of follows plus navigation metadata. */
@ObjectType()
export class FollowPage {
  /** Items returned for the current page. */
  @Field(() => [Follow])
  items!: Follow[];

  /** Cursor navigation metadata for the current page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}
