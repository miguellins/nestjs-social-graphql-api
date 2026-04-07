import { Field, ObjectType } from "@nestjs/graphql";

/** Shared cursor-pagination metadata returned alongside paged list results. */
@ObjectType()
export class PageInfo {
  /** Cursor for the last item in the current page, if any items were returned. Reuse it only with the same filter and ordering inputs. */
  @Field(() => String, {
    nullable: true,
  })
  endCursor!: string | null;

  /** Indicates whether another page can be fetched after the current page. */
  @Field(() => Boolean)
  hasNextPage!: boolean;
}
