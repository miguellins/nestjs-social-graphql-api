/** Names the durable outbox event that deletes home feed projection rows for one post. */
export const HOME_FEED_POST_CLEANUP_EVENT = "feed.home.post.cleanup";

/** Deletes all home feed projection entries for one post (used for moderation/removal). */
export type HomeFeedPostCleanupPayload = {
  postId: number;
};

/** Names the durable outbox event that hides home feed projection rows for one user+author relationship. */
export const HOME_FEED_RELATIONSHIP_HIDE_EVENT = "feed.home.relationship.hide";

/** Soft-hides one user's home feed entries authored by one author (unfollow/block/privacy changes). */
export type HomeFeedRelationshipHidePayload = {
  userId: number;
  authorId: number;
};
