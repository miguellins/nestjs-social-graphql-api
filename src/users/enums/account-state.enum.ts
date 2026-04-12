import { registerEnumType } from "@nestjs/graphql";

import { AccountState } from "@prisma/client";

registerEnumType(AccountState, {
  name: "AccountState",
  description: "Represents the current access state of a user account",
});

export { AccountState };
