import { Field, InputType, Int } from "@nestjs/graphql";

import { IsInt, Min } from "class-validator";

@InputType()
export class MuteUserInput {
  /** Identifier of the user to mute. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  userId!: number;
}
