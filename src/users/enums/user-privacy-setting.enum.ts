import { registerEnumType } from "@nestjs/graphql";

import { UserPrivacySetting } from "@prisma/client";

registerEnumType(UserPrivacySetting, {
  name: "UserPrivacySetting",
  description: "Controls whether a user's account is public or private",
});

export { UserPrivacySetting };
