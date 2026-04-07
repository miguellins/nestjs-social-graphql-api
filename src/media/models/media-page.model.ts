import { Field, ObjectType } from "@nestjs/graphql";

import { PageInfo } from "@/common/models/page-info.model";

import { Media } from "@/media/models/media.model";

/** Cursor-paginated page of media plus navigation metadata. */
@ObjectType()
export class MediaPage {
  /** Items returned for the current page. */
  @Field(() => [Media])
  items!: Media[];

  /** Cursor navigation metadata for the current page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}
