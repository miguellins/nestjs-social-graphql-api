import { Field, ObjectType } from "@nestjs/graphql";

import { PageInfo } from "@/common/models/page-info.model";
import { Comment } from "@/comments/models/comment.model";

/** Cursor-paginated page of comments plus navigation metadata. */
@ObjectType()
export class CommentPage {
  /** Items returned for the current page. */
  @Field(() => [Comment])
  items!: Comment[];

  /** Cursor navigation metadata for the current page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}
