import { SafeUserPreview } from "src/posts/models/safe-user-preview.model";

export type SafeFollowDTO = {
  id: number;
  createdAt: Date;
  followerId: number;
  followingId: number;

  follower: SafeUserPreview;
  following: SafeUserPreview;
};
