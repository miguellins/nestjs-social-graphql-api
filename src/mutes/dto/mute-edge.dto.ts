import { Field, Int, ObjectType } from "@nestjs/graphql";

/** Represents one directional mute relationship edge. */
@ObjectType()
export class MuteEdgeDTO {
  /** Unique identifier of the mute edge. */
  @Field(() => Int)
  id!: number;

  /** User id of the muter (the viewer who muted someone). */
  @Field(() => Int)
  muterId!: number;

  /** User id of the muted user. */
  @Field(() => Int)
  mutedUserId!: number;

  /** When this mute edge was created. */
  @Field(() => Date)
  createdAt!: Date;
}
