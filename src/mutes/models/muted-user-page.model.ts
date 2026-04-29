import { Field, ObjectType } from "@nestjs/graphql";

import { PageInfo } from "@/common/models/page-info.model";
import { SafeUser } from "@/users/models/safe-user.model";

/** Cursor-paginated page of users muted by the current user. */
@ObjectType()
export class MutedUserPage {
  /** Items returned for the current page. */
  @Field(() => [SafeUser])
  items!: SafeUser[];

  /** Cursor navigation metadata for the current page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}
