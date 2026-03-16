import { InputType } from "@nestjs/graphql";

import { IsNotEmpty, IsString } from "class-validator";

@InputType()
export class LoginInput {
  /** Username used to authenticate the user. */
  @IsString()
  @IsNotEmpty()
  username: string;

  /** Plain-text password submitted during login. */
  @IsString()
  @IsNotEmpty()
  password: string;
}
