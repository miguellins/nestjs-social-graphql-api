import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";

import { Post } from "@/posts/models/post.model";

/** Public bookmark representation for one authenticated user's saved post relation. */
@ObjectType()
export class Bookmark {
  /** Unique identifier of the bookmark relation. */
  @Field(() => ID)
  id!: number;

  /** Timestamp indicating when the bookmark was created. */
  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  /** Safe public post snapshot nested inside the bookmark result. */
  @Field(() => Post)
  post!: Post;
}
