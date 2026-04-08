import { InputType } from "@nestjs/graphql";

import { IsNotEmpty, IsString, MaxLength } from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

@InputType()
export class LogoutInput {
  /** Raw refresh token for the session that should be revoked. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken: string;
}
