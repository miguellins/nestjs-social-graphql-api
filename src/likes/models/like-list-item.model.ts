import { Field, ObjectType } from "@nestjs/graphql";

import { LikedPostPreview } from "@/likes/models/liked-post-preview.model";
import { LikePreview } from "@/posts/models/like-preview.model";

/** Lightweight representation of a Like entity optimized for list views. */
@ObjectType()
export class LikeListItem extends LikePreview {
  /** Public representation of the post that was liked. */
  @Field(() => LikedPostPreview)
  post: LikedPostPreview;
}
