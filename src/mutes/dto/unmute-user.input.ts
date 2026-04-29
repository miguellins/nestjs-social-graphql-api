import { Field, InputType, Int } from "@nestjs/graphql";

import { IsInt, Min } from "class-validator";

@InputType()
export class UnmuteUserInput {
  /** Identifier of the user to unmute. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  userId!: number;
}
