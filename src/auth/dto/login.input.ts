import { IsNotEmpty, IsString } from "class-validator";

import { InputType } from "@nestjs/graphql";

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
