import { registerEnumType } from "@nestjs/graphql";

import { FollowRequestStatus } from "@prisma/client";

registerEnumType(FollowRequestStatus, {
  name: "FollowRequestStatus",
  description: "Represents the current state of a follow request",
});

export { FollowRequestStatus };
