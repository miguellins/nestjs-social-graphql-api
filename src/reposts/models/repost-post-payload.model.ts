import { Field, ID, Int, ObjectType } from "@nestjs/graphql";

/** Payload returned after a successful repost create operation. */
@ObjectType()
export class RepostPostPayload {
  /** Created repost wrapper post id. */
  @Field(() => ID)
  repostPostId: number;

  /** Root source post id that was reposted. */
  @Field(() => ID)
  sourcePostId: number;

  /** Updated repost count on the root source post. */
  @Field(() => Int)
  repostsCount: number;
}
