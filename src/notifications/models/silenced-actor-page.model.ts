import { Field, ObjectType } from "@nestjs/graphql";

import { PageInfo } from "@/common/models/page-info.model";
import { SilencedActorEdge } from "@/notifications/models/silenced-actor-edge.model";

/** Cursor-paginated page of silenced notification actors. */
@ObjectType()
export class SilencedActorPage {
  /** Silenced actor edges returned for the current page. */
  @Field(() => [SilencedActorEdge])
  items!: SilencedActorEdge[];

  /** Cursor navigation metadata for the current page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}
