import { Field, ObjectType } from "@nestjs/graphql";

import { PageInfo } from "@/common/models/page-info.model";

import { SafeUser } from "@/users/models/safe-user.model";

/** Cursor-paginated page of users plus navigation metadata. */
@ObjectType()
export class UserPage {
  /** Items returned for the current page. */
  @Field(() => [SafeUser])
  items!: SafeUser[];

  /** Cursor navigation metadata for the current page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}
