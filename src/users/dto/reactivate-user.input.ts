import { Field, InputType, Int } from "@nestjs/graphql";

import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

/** Moderation input used to reactivate a suspended user account. */
@InputType()
export class ReactivateUserInput {
  /** User id to reactivate. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  userId: number;

  /** Required moderation reason for the reactivation. */
  @Field()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
