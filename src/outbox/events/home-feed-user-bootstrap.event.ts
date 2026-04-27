/** Names the durable outbox event that bootstraps one user's home feed projection (Phase 3 cohort prepopulation). */
export const HOME_FEED_USER_BOOTSTRAP_EVENT = "feed.home.user.bootstrap";

/** Bootstraps one user's home feed by backfilling recent posts from followed authors. */
export type HomeFeedUserBootstrapPayload = {
  userId: number;
};
