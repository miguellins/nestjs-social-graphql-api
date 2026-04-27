/** Names the durable outbox event that backfills recent posts into one user's home feed after a follow. */
export const HOME_FEED_FOLLOW_BACKFILL_EVENT = "feed.home.follow.backfill";

/** Carries the stable identifiers needed to backfill one follower's home feed. */
export type HomeFeedFollowBackfillPayload = {
  followerId: number;
  followingId: number;
};
