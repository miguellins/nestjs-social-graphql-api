import { ArgsType, Field } from "@nestjs/graphql";

import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { Normalize } from "@/common/transformer/normalize.transformer";

import {
  USERNAME_REGEX,
  USERNAME_REGEX_MESSAGE,
} from "@/users/constants/username.constants";

@ArgsType()
export class GetUserByUsernameArgs {
  /** Public username used to identify a user profile. */
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
