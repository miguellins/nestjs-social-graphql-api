import { FollowRequestStatus } from "@/follows/enums/follow-request-status.enum";

import type { SafeUserPreview } from "@/users/models/safe-user-preview.model";

import type { Prisma } from "@prisma/client";

/** Safe DTO shape for a follow request with requester and target previews. */
export type FollowRequestDTO = {
  id: number;
  status: FollowRequestStatus;
  createdAt: Date;
  requester: SafeUserPreview;
  targetUser: SafeUserPreview;
};

/** Prisma select shape for FollowRequestDTO. */
export const FollowRequestSelect = {
  id: true,
  status: true,
  createdAt: true,
  requester: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
  targetUser: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
} satisfies Prisma.FollowRequestSelect;
