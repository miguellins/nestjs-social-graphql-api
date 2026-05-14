import { Field, Int, ObjectType } from "@nestjs/graphql";

/** Minimal public hashtag discovery result. */
@ObjectType()
export class HashtagSearchResult {
  /** Canonical lowercase hashtag slug without the leading #. */
  @Field()
  slug!: string;

  /** Public anonymous timeline post count for this hashtag. */
  @Field(() => Int)
  postsCount!: number;
}
