import { Field, ObjectType } from "@nestjs/graphql";

import { PageInfo } from "@/common/models/page-info.model";
import { MuteEdgeDTO } from "@/mutes/dto/mute-edge.dto";

/** Cursor-paginated page of mute relationship edges for the current user. */
@ObjectType()
export class MutedUserPage {
  /** Mute edges returned for the current page. */
  @Field(() => [MuteEdgeDTO])
  items!: MuteEdgeDTO[];

  /** Cursor navigation metadata for the current page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}
