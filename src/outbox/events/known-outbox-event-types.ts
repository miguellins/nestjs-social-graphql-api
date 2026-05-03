import { FOLLOW_REQUEST_NOTIFICATION_DELIVERY_EVENT } from "@/outbox/events/follow-request-notification-delivery.event";
import { COMMENT_REPLY_NOTIFICATION_DELIVERY_EVENT } from "@/outbox/events/comment-reply-notification-delivery.event";
import { HOME_FEED_FOLLOW_BACKFILL_EVENT } from "@/outbox/events/home-feed-follow-backfill.event";
import { HOME_FEED_USER_BOOTSTRAP_EVENT } from "@/outbox/events/home-feed-user-bootstrap.event";
import { HOME_FEED_POST_FANOUT_EVENT } from "@/outbox/events/home-feed-post-fanout.event";
import {
  HOME_FEED_POST_CLEANUP_EVENT,
  HOME_FEED_RELATIONSHIP_HIDE_EVENT,
} from "@/outbox/events/home-feed-cleanup.event";

/** Stable readiness bucket used for outbox rows produced with unrecognized event types. */
export const UNKNOWN_OUTBOX_EVENT_TYPE = "unknown";

/** Canonical allowlist of durable outbox event types reported by readiness. */
export const KNOWN_OUTBOX_EVENT_TYPES = [
  HOME_FEED_POST_FANOUT_EVENT,
  HOME_FEED_FOLLOW_BACKFILL_EVENT,
  HOME_FEED_USER_BOOTSTRAP_EVENT,
  HOME_FEED_POST_CLEANUP_EVENT,
  HOME_FEED_RELATIONSHIP_HIDE_EVENT,
  COMMENT_REPLY_NOTIFICATION_DELIVERY_EVENT,
  FOLLOW_REQUEST_NOTIFICATION_DELIVERY_EVENT,
] as const;

/** Canonical allowlist of home-feed projection event types. */
export const HOME_FEED_EVENT_TYPES = [
  HOME_FEED_POST_FANOUT_EVENT,
  HOME_FEED_FOLLOW_BACKFILL_EVENT,
  HOME_FEED_USER_BOOTSTRAP_EVENT,
  HOME_FEED_POST_CLEANUP_EVENT,
  HOME_FEED_RELATIONSHIP_HIDE_EVENT,
] as const;
