import { ArgsType, Field } from "@nestjs/graphql";

import { IsOptional } from "class-validator";

import { NotificationReadStatus } from "@/notifications/enums/notification-read-status.enum";

import { PaginationArgs } from "@/common/args/pagination.args";

@ArgsType()
export class FindNotificationsArgs extends PaginationArgs {
  @IsOptional()
  @Field(() => NotificationReadStatus, {
    nullable: true,
  })
  status?: NotificationReadStatus;
}
