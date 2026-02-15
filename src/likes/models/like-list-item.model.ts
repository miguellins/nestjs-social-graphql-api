import { Field, ID, ObjectType, GraphQLISODateTime } from "@nestjs/graphql";

import { SafeUserPreview } from "src/posts/models/safe-user-preview.model";
import { PostListItem } from "src/posts/models/post-list-item.model";

/**
 * Lightweight Like object for list queries (optimized + safe).
 */

@ObjectType()
export class LikeListItem {
  @Field(() => ID)
  id: number;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => SafeUserPreview)
  user: SafeUserPreview;

  @Field(() => PostListItem)
  post: PostListItem;
}
