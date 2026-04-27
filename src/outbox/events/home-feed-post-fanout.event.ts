/** Names the durable outbox event that fans a newly created post into home feed projections. */
export const HOME_FEED_POST_FANOUT_EVENT = "feed.home.post.fanout";

/** Carries the stable identifiers needed to fan a post into follower home feeds. */
export type HomeFeedPostFanoutPayload = {
  postId: number;
  authorId: number;
  postCreatedAt: string;
  reason: "SELF_POST" | "FOLLOWING_POST";
};
