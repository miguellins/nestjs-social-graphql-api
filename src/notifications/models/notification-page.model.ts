import { Field, ObjectType } from "@nestjs/graphql";

import { PageInfo } from "@/common/models/page-info.model";

import { NotificationDTO } from "@/notifications/models/notification.model";

/** Cursor-paginated page of notifications plus navigation metadata. */
@ObjectType()
export class NotificationPage {
  /** Items returned for the current page. */
  @Field(() => [NotificationDTO])
  items!: NotificationDTO[];

  /** Cursor navigation metadata for the current page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}
