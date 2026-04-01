import { InputType } from "@nestjs/graphql";

import { IsEmail, IsNotEmpty, MaxLength, MinLength } from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

@InputType()
export class RequestPasswordResetInput {
  /** Email address that should receive password reset instructions. */
  @Trim()
  @IsEmail()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  email: string;
}
