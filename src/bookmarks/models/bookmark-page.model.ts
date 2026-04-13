import { Field, ObjectType } from "@nestjs/graphql";

import { PageInfo } from "@/common/models/page-info.model";

import { Bookmark } from "@/bookmarks/models/bookmark.model";

/** Cursor-paginated page of bookmarks plus navigation metadata. */
@ObjectType()
export class BookmarkPage {
  /** Items returned for the current page. */
  @Field(() => [Bookmark])
  items!: Bookmark[];

  /** Cursor navigation metadata for the current page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}
