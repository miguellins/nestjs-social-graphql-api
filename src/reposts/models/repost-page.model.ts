import { Field, ObjectType } from "@nestjs/graphql";

import { PageInfo } from "@/common/models/page-info.model";

import { RepostListItem } from "@/reposts/models/repost-list-item.model";

/** Cursor-paginated page of reposts plus navigation metadata. */
@ObjectType()
export class RepostPage {
  /** Items returned for the current page. */
  @Field(() => [RepostListItem])
  items!: RepostListItem[];

  /** Cursor navigation metadata for the current page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}
