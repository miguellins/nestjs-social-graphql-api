import { Field, InputType, Int } from "@nestjs/graphql";

import { IsInt, Min } from "class-validator";

@InputType()
export class BlockUserInput {
  /** Identifier of the user to block. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  targetUserId: number;
}
