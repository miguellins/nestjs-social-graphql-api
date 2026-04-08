import { InputType } from "@nestjs/graphql";

import { IsNotEmpty, IsString, MaxLength } from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

@InputType()
export class RefreshSessionInput {
  /** Raw refresh token returned by a previous successful login or refresh. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken: string;
}
