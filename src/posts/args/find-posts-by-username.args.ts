import { ArgsType, Field } from "@nestjs/graphql";

import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { Normalize } from "@/common/transformer/normalize.transformer";
import { PaginationArgs } from "@/common/args/pagination.args";

import {
  USERNAME_REGEX,
  USERNAME_REGEX_MESSAGE,
} from "@/users/constants/username.constants";

/**
 * GraphQL args for public post timeline lookup by username
 *
 * Validates the author identifier plus shared pagination controls
 */

@ArgsType()
export class FindPostsByUsernameArgs extends PaginationArgs {
  /** Public username used to identify the post author timeline. */
  @Field(() => String)
  @Normalize()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(15)
  @Matches(USERNAME_REGEX, {
    message: USERNAME_REGEX_MESSAGE,
  })
  username: string;
}
