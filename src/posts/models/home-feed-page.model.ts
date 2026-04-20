import { Field, ObjectType } from "@nestjs/graphql";

import { PageInfo } from "@/common/models/page-info.model";

import { HomeFeedItem } from "@/posts/models/home-feed-item.model";

/** Cursor-paginated page of home-feed items plus navigation metadata. */
@ObjectType()
export class HomeFeedPage {
  /** Items returned for the current feed page. */
  @Field(() => [HomeFeedItem])
  items!: HomeFeedItem[];

  /** Cursor navigation metadata for the current feed page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}
