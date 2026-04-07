import { Field, ObjectType } from "@nestjs/graphql";

import { PageInfo } from "@/common/models/page-info.model";

import { Post } from "@/posts/models/post.model";

/** Cursor-paginated page of posts plus navigation metadata. */
@ObjectType()
export class PostPage {
  /** Items returned for the current page. */
  @Field(() => [Post])
  items!: Post[];

  /** Cursor navigation metadata for the current page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}
