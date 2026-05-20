import { registerEnumType } from "@nestjs/graphql";

export enum MuteScope {
  FEED = "FEED",
  POSTS = "POSTS",
  COMMENTS = "COMMENTS",
  NOTIFICATIONS = "NOTIFICATIONS",
}

registerEnumType(MuteScope, {
  name: "MuteScope",
});

export const ALL_MUTE_SCOPES = [
  MuteScope.FEED,
  MuteScope.POSTS,
  MuteScope.COMMENTS,
  MuteScope.NOTIFICATIONS,
] as const;
