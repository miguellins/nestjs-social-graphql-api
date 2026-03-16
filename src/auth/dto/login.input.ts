import { InputType } from "@nestjs/graphql";

import { IsNotEmpty, IsString } from "class-validator";

/**
 * GraphQL input for login requests
 *
 * Validates the credentials sent by the client
 */

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
