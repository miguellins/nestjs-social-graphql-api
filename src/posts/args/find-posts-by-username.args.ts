import { ArgsType, Field } from "@nestjs/graphql";

import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";
import { Normalize } from "@/common/transformer/normalize.transformer";

import {
  USERNAME_REGEX,
  USERNAME_REGEX_MESSAGE,
} from "@/users/constants/username.constants";

@ArgsType()
export class FindPostsByUsernameArgs extends CursorPaginationArgs {
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
