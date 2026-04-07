import { Field, ObjectType } from "@nestjs/graphql";

import { PageInfo } from "@/common/models/page-info.model";

import { LikeListItem } from "@/likes/models/like-list-item.model";

/** Cursor-paginated page of likes plus navigation metadata. */
@ObjectType()
export class LikePage {
  /** Items returned for the current page. */
  @Field(() => [LikeListItem])
  items!: LikeListItem[];

  /** Cursor navigation metadata for the current page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}
