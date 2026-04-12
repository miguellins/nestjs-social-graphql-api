import { Field, InputType } from "@nestjs/graphql";

import { IsEnum } from "class-validator";

import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";

/** Updates the current authenticated user's account-level privacy setting. */
@InputType()
export class UpdateMyPrivacySettingInput {
  /** New account privacy setting applied to profile and content visibility. */
  @Field(() => UserPrivacySetting)
  @IsEnum(UserPrivacySetting)
  privacySetting: UserPrivacySetting;
}
