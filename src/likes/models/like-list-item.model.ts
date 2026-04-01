import { Field, ObjectType } from "@nestjs/graphql";

import { LikePreview } from "@/posts/models/like-preview.model";
import { Post } from "@/posts/models/post.model";

/** Lightweight representation of a Like entity optimized for list views. */
@ObjectType()
export class LikeListItem extends LikePreview {
  /** Public representation of the post that was liked. */
  @Field(() => Post)
  post: Post;
}
