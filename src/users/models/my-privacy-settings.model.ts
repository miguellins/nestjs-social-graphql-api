import { Field, ObjectType } from "@nestjs/graphql";

import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { AccountState } from "@/users/enums/account-state.enum";

/** Authenticated viewer's privacy and account-state settings. */
@ObjectType()
export class MyPrivacySettings {
  /** Human-readable result message for privacy-setting reads or updates. */
  @Field()
  message: string;

  /** Current account-wide privacy mode. */
  @Field(() => UserPrivacySetting)
  privacySetting: UserPrivacySetting;

  /** Current account access state. */
  @Field(() => AccountState)
  accountState: AccountState;
}
