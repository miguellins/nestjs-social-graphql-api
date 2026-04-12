import { Field, InputType, Int } from "@nestjs/graphql";

import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

/** Moderation input used to suspend a user account. */
@InputType()
export class SuspendUserInput {
  /** User id to suspend. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  userId: number;

  /** Required moderation reason for the suspension. */
  @Field()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
