import { Field, ObjectType } from "@nestjs/graphql";

import { LikePreview } from "@/posts/models/like-preview.model";
import { Post } from "@/posts/models/posts.model";

/**
 * GraphQL ObjectType representing a lightweight Like response
 *
 * What it does:
 * - Exposes only the necessary fields for list queries
 * - Prevents deep relational nesting
 * - Keeps payload small and predictable
 * - Improves performance for high-volume endpoints
 *
 * Security layer:
 * - Uses SafeUserPreview instead of full User
 * - Uses Post instead of PostDetail
 * - Ensures no sensitive user data is exposed
 *
 * Design philosophy:
 * List endpoints should always return the smallest useful shape
 * Heavy objects belong to single-record detail queries
 *
 * Lightweight DTOs protect both:
 * - Database performance
 * - API stability
 */

@ObjectType({
  description:
    "Lightweight representation of a Like entity optimized for list views",
})
export class LikeListItem extends LikePreview {
  @Field(() => Post, {
    description: "Public representation of the post that was liked",
  })
  post: Post;
}
