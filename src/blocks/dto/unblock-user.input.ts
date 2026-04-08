import { Field, InputType, Int } from "@nestjs/graphql";

import { IsInt, Min } from "class-validator";

@InputType()
export class UnblockUserInput {
  /** Identifier of the user to unblock. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  targetUserId: number;
}
