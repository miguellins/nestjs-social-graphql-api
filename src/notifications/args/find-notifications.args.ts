import { ArgsType, Field } from "@nestjs/graphql";

import { IsOptional } from "class-validator";

import { NotificationReadStatus } from "@/notifications/enums/notification-read-status.enum";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";

/** GraphQL arguments for finding notifications for the current user. */
@ArgsType()
export class FindNotificationsArgs extends CursorPaginationArgs {
  /** Optional filter for notification read status (ALL/READ/UNREAD). */
  @IsOptional()
  @Field(() => NotificationReadStatus, {
    nullable: true,
  })
  status?: NotificationReadStatus;
}
