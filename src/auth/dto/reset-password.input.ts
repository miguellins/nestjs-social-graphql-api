import { InputType } from "@nestjs/graphql";

import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

@InputType()
export class ResetPasswordInput {
  /** Raw password reset token from the local file sink or future email delivery. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;

  /** New plain-text password that will be hashed before persistence. */
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
