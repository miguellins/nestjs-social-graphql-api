# MODULE REVIEW

# Auth: 96/100
Strength: strong auth lifecycle with refresh-session rotation, logout, password reset, email verification, password-hash upgrade-on-login, session metadata capture, suspended/deactivated account enforcement, and solid spec coverage across `auth.service.ts`, `auth-session.service.ts`, `auth.resolver.ts`, and `jwt.strategy.ts`. The session layer includes explicit session inventory and revoke flows rather than only token issuance, and the module benefits from request correlation, structured logging, and fail-fast security configuration across the app.

Weakness: auth is now split into facade, credential, token, and session boundaries, but the session model is still short of a fuller device/session-management product with device labeling, anomaly detection, richer audit history, or higher-level session-risk features. Auth-domain side effects are still mostly request-bound rather than modeled as a broader async event stream.


# Users: 96/100
Strength: privacy settings, account-state moderation, moderation metadata, safe DTO/select discipline, cache-backed user reads through `UserCacheService`, and clean integration with auth/security concerns remain strong. The user surface now includes v1 richer profiles with bio, website, location, owner-only `myProfile`, separate `updateMyProfile`, avatar URL projection, and viewer-aware profile visibility for blocks, private accounts, and inactive account states. Account-state handling feeds correctly into protected reads such as feeds, profiles, and authentication.

Weakness: users is now split across profile-read, write, account-state, cache, and facade boundaries, and the user domain still has intentionally narrow preferences beyond notification toggles. Profile v1 does not include banners, field-level privacy, pronouns, verified badges, or moderator profile-edit tooling.


# Posts / Home Feed: 98/100
Strength: privacy-aware visibility, block-aware and mute-aware reads, moderation-aware removal, cache discipline, media-aware projection, comment integration, hashtag write integration, and the split between `PostsService`, `PostListReadService`, `PostWriteService`, `PostModerationService`, `PostCacheService`, `PostReadService`, and `FeedReadService` is cleaner and more defensible. `CommentsReadService` remains the source for threaded comments in post detail reads. The home feed is now materially stronger because it has both the legacy fanout-on-read path and an optional persisted `HomeFeedEntry` projection driven by outbox events, with cohort rollout, allow/deny user gates, forced-user rollout, configurable fallback, bootstrap, shadow compare with hashed diagnostics, cleanup, relationship soft-hide, retention controls, projection-read lag metrics, and muted-author filtering.

Weakness: the posts coordinator is now slim, but the home feed remains an early chronological social-graph feed. The new projection is a credible scalability step, but it is not yet a richer ranking, recommendation, explainability, or fully event-platform-backed feed subsystem.


# Hashtags / Discovery / Search: 94/100
Strength: normalized content hashtags now live in a dedicated `HashtagsModule` with conservative ASCII parsing, reserved-slug rejection, a 10-tag cap, transactional `PostHashtag` replacement during post writes, same-transaction public `postsCount` deltas, removal cleanup, `postsByHashtag`, and `searchHashtags`. Discovery now also has a dedicated `SearchModule` with MySQL FULLTEXT-backed `searchPosts` and `searchUsers`, separate search throttling, DTO plus Zod validation, versioned read-through caches, safe DTO/select hydration, and existing post visibility, block, and mute filters applied after raw relevance lookup. Historical hashtag join and count drift now have a dry-run-first maintenance script and runbook with canary flags, invalid-content skip classification, chunk cache version bumps, and aggregate public-count repair.

Weakness: search remains V1. It uses bounded raw MySQL candidate queries and may return sparse pages after viewer-aware filters. There is no unified mixed-result discovery, trending surface, typo tolerance, search analytics, external engine, or relevance cursor contract yet. The hashtag reconciliation job still needs to be run against real historical data, and there is no continuous counter reconciliation for future account-visibility changes.


# Comments: 98/100
Strength: one-level threading is implemented cleanly with `parentCommentId`, `CommentsReadService`, bounded inline replies, reply-aware counters, reply notifications, and a non-recursive GraphQL contract through `CommentReply`. The delete-path counter fix remains meaningful, and the comment write path is stronger because reply notifications can be persisted transactionally with a durable outbox event when enabled. Mention syncing, block-aware and mute-aware suppression, self-reply suppression, and outbox-backed reply delivery make the module product-realistic and operationally safer.

Weakness: comments is now split across facade, read, write, and moderation boundaries, and comment threads still stop at a practical v1 shape rather than deeper thread navigation or reply pagination.


# Reposts: 88/100
Strength: repost and quote flows now use typed post rows, transactional root repost counters, root-source resolution for reposts and quotes, visibility/block/mute/account-state gates, cache invalidation, home-feed fanout reuse, embedded source previews, viewer repost state, quote mention/hashtag sync, and separate notification preferences for repost and quote alerts. The module is intentionally small and follows the existing thin resolver plus service-owned domain behavior pattern.

Weakness: v1 intentionally omits quote editing, quote counts, durable outbox notification delivery for repost/quote alerts, richer profile repost tabs beyond `myReposts`, and deeper analytics around redistribution behavior.


# Likes: 90/100
Strength: transactional counter consistency, uniqueness handling, cache invalidation, cursor pagination, and notification triggering are solid. The module is practical and consistent with the rest of the service-layer patterns.

Weakness: the feature is still narrow, with no reaction model, limited viewer-relative enrichment outside downstream post/feed shaping, and only basic list/detail read shapes.


# Follows: 96/100
Strength: private-account follow requests, pending incoming/outgoing views, approve/reject/cancel flows, block-aware restrictions, notification hooks, and direct impact on feed visibility make this meaningfully more realistic than a simple follow table. The guarded transactional state-transition fixes materially improved correctness, and the module now also participates in home-feed projection by enqueueing follow backfill and relationship-hide events when projection enqueue/backfill is enabled.

Weakness: follows is now split across facade, relationship, request, feed-trigger, cache, and guard boundaries; `deleteFollow` semantics remain a little conceptually muddy, and the relationship model is still basic beyond follow/request state handling. Feed projection integration improves downstream behavior but also increases the amount of orchestration concentrated in this service.


# Blocks: 93/100
Strength: a clear trust-and-safety baseline with block creation, unblock flow, bidirectional follow cleanup, follow-request cleanup, sensible cache invalidation, and downstream impact on visibility-sensitive reads such as feed, bookmarks, comments, and notifications. The block list also has proper bounded pagination.

Weakness: it is still a compact safety feature without restrict, hidden interactions, richer preference controls, or broader abuse workflow integration.


# Mutes: 96/100
Strength: the mutes module adds a lighter-weight relationship preference separate from blocking, with `muteUser`, `updateMuteScopes`, `unmuteUser`, `myMutedUsers`, and `isMuted` GraphQL operations behind `MUTES_ENABLED`. It now supports scoped mutes for `FEED`, `POSTS`, `COMMENTS`, and `NOTIFICATIONS` behind `MUTE_SCOPES_ENABLED`, while preserving rollback-compatible full-mute behavior when scope rollout is disabled. It uses explicit Prisma access, bounded cursor pagination, per-user cache versioning, block/mute conflict rejection, fail-closed stored-scope parsing, and service tests across the rollout flag combinations. The feature is integrated into posts, home feed projection reads, post detail reads, comments, bookmarks, hashtags, and notifications so muted actors are filtered or suppressed by the correct surface scope. FEED scope additions enqueue a best-effort durable `feed.home.relationship.hide` outbox event so stale projected rows for the muted author are soft-hidden instead of relying only on read-time filtering.

Weakness: the feature is still flag-gated and intentionally v1. It has no expiration, reason/category, bulk management, audit trail, or automatic projection un-hide when FEED scope is removed. Cache invalidation is still simple, and the durable cleanup path is intentionally best-effort rather than a broader preference-event pipeline.


# Reports: 95/100
Strength: report intake, moderation review queues, status transitions, and schema support for linked moderation actions are coherent and grounded in a real moderation workflow. The Prisma hardening improved duplicate-open report handling by moving toward a database-enforced dedup invariant via `openDedupKey`, while preserving current conflict behavior at the service layer.

Weakness: `reports.service.ts` still combines intake and review concerns, and the "exactly one target" report invariant still needs a reviewed MySQL migration/constraint to be fully enforced at the database level rather than partially protected in application logic plus schema shape.


# Notifications: 99/100
Strength: durable persistence before publish, self-notification suppression, block-aware and NOTIFICATIONS-scope mute suppression, actor-silence suppression, explicit trigger/delivery separation, `COMMENT_REPLIED` support, unread count, mark-as-read flows, muted-actor filtering in notification lists, notification preference read/update operations, and working realtime delivery through `notificationReceived` give this module solid product footing. It is materially stronger because reply and follow-request notifications can be persisted first and then delivered through the outbox-backed worker path instead of relying only on immediate best-effort publish. Mention-driven notifications, reply flows, persisted per-user toggles for reply, follow-request, mentions, post likes, reposts, quotes, and new followers, per-actor notification silence, and `myInteractionPreferences` make it meaningfully more complete than a simple in-app alert list. Suppression gates new persistence in the order block, mute, actor silence, then global preferences, and emits `notification_suppressed_total` with low-cardinality `mute`, `actor`, and `prefs` reasons.

Weakness: notification coverage is still relatively narrow overall, with a limited event set, no digesting, no channel routing, limited delivery history beyond the current realtime-delivered marker, and no broader multi-channel delivery strategy.


# Outbox: 98/100
Strength: the outbox module now gives the project a real durable async backbone for post-commit follow-up work. `OutboxService`, `OutboxProcessorService`, `OutboxHandlerRegistryService`, and `OutboxWorkerService` form a credible implementation with persisted rows, registry-routed handlers, claim-and-process semantics, retry scheduling, permanent-failure handling, retention cleanup, event-type-aware readiness visibility through `/health/ready`, and Prometheus metrics for worker ticks, errors, event outcomes, processing latency, batch size, backlog state, purge health, and DB refresh failures. The readiness summary now reports all known event types plus an `unknown` rollup with pending, failed, processing, oldest pending, and oldest processing state while keeping backlog report-only. The surface is no longer single-purpose: it handles comment reply notification delivery, follow-request notification delivery, and home-feed projection events for post fanout, follow backfill, user bootstrap, post cleanup, and relationship hiding from follow and mute transitions. Feed projection gating is handler-owned, so intentionally disabled projection workers reschedule feed rows without burning retries.

Weakness: the module is still compact and uses a lightweight handler registry rather than a broader job taxonomy or queue platform. The event-type readiness and metrics provide useful v1 visibility, but worker deployment concerns, richer operational controls, and a more generalized queue platform model will matter more as more domains move onto the outbox.


# GraphQL Subscriptions: 97/100
Strength: authenticated websocket handshake, explicit connection failure handling, Redis-backed pub/sub, recipient-scoped notification delivery, and practical multi-instance readiness are strong end to end. This layer is stronger because notification delivery can now be worker-owned through the durable outbox path instead of being tied only to the request lifecycle.

Weakness: delivery is still not a replayable event stream, and the subscription layer still lacks stronger delivery guarantees, resumability, or consumer recovery semantics after disconnects.


# Media: 98/100
Strength: upload orchestration, ownership and policy enforcement, validation, R2 integration, attachment constraints, and the split across `MediaPolicyService`, `MediaQueryService`, `MediaReadProjectionService`, `MediaValidationService`, and `MediaService` are a clear architectural strength. The module now also supports profile-avatar uploads with `PROFILE_AVATAR`, stricter image-only square validation, optional-storage unavailable behavior, avatar assignment, user-cache invalidation, and best-effort replacement cleanup. The attach-path fix remains meaningful: `sortOrder` reservation now happens transactionally with bounded retry for collisions, and duplicate-attachment vs ordering conflicts are distinguished more correctly.

Weakness: the media lifecycle is still early-stage, with no processing pipeline, no variants/transcoding story, and no fuller orphan cleanup or asset lifecycle management beyond existing pending-expiry cleanup and best-effort avatar replacement deletion.


# Mentions: 95/100
Strength: mentions are a real domain feature rather than a controller-level add-on, with durable mention syncing, notification integration, and visibility-aware delivery. The batching change materially improved the write path by removing the per-recipient Prisma visibility N+1 pattern.

Weakness: the feature is still scoped to mention parsing/sync/notify flows rather than broader conversation/discovery value, and mention-driven product surfaces are still limited.


# Bookmarks: 91/100
Strength: viewer-aware and mute-aware bookmark visibility, per-user versioned cache invalidation, active-account enforcement, and reuse of `PostReadService` visibility rules keep the feature consistent with the rest of the platform.

Weakness: it is still a compact utility feature with no richer organization, tagging, collections, or bookmark-specific product depth.


# Ops / Health: 96/100
Strength: the project has real liveness/readiness endpoints through `HealthController` and `HealthService`, dependency-aware readiness checks for DB/cache/pubsub, boot-complete tracking, report-only outbox backlog summary, and direct test coverage for the operational wiring. Readiness now reflects the async processing surface through aggregate outbox counters plus event-type-aware buckets for known producers and an `unknown` rollup, while metrics provide a more scrape-friendly view of outbox/feed projection health. Liveness remains cheap and uncoupled from database, cache, pubsub, or outbox state.

Weakness: the layer is still not production-complete. Metrics and readiness now cover the outbox/feed projection slice more clearly, but there is still no tracing posture, broader SLO-oriented monitoring stack, or deeper worker-health and failure analytics across the full application.


# Metrics: 95/100
Strength: `MetricsModule`, `MetricsRegistryService`, and `MetricsServerService` add a real Prometheus-compatible metrics surface behind `METRICS_ENABLED`, with a dedicated internal `/metrics` server per process, typed env configuration, stable low-cardinality metric names, and direct tests for disabled/enabled endpoint behavior and emitted series. The metrics surface covers outbox worker ticks/errors, event outcomes, batch sizes, processing latency, feed projection purge health, DB-backed backlog gauges, shadow compare counters, cleanup enqueue outcomes, notification suppression counts for mute, actor silence, and global preferences, and refresh failures. Prometheus alert rules, a Grafana dashboard, and the outbox backlog runbook now align with event-type-aware readiness reporting, including guidance for unknown outbox producers.

Weakness: the module is intentionally v1 and focused on outbox/feed projection health. It does not yet include a broader metrics taxonomy across all modules, request/GraphQL latency metrics, cache hit/miss metrics, Prisma query timing, tracing correlation, or production deployment manifests for scrape targets and network policy.


# Request Context / Logging: 96/100
Strength: `RequestContextMiddleware`, `RequestContextService`, and `AppLoggerService` give the app correlation IDs and structured logging across request-bound behavior. This is a meaningful foundation for debugging auth, GraphQL, cache, health, and outbox flows without scattering correlation logic through feature services.

Weakness: the logging layer is still primarily structured application logging. It does not yet include distributed tracing, metrics correlation, sampling policy, log redaction policy as a first-class module, or a broader observability pipeline.


# Cache Layer: 95/100
Strength: Redis-backed cache configuration, `CacheHelperService`, read-through `getOrSet(...)`, deterministic key patterns, detail-key deletion, list-version invalidation, and cache health checks give the codebase a disciplined caching baseline. Feature services generally use cache helpers instead of direct cache-manager calls.

Weakness: invalidation correctness still depends heavily on service discipline and careful review. There is no centralized dependency graph for cache invalidation, no automatic stale-key detection, and no broader cache metrics around hit rate, churn, or invalidation effectiveness.


# Config / Environment: 97/100
Strength: environment validation is fail-fast and typed through Zod, including auth secrets, Redis, optional R2 media storage, GraphQL complexity, outbox controls, metrics controls, scoped mutes and actor-silence rollout, profile-avatar byte limits, and the full home-feed projection rollout surface. Boolean and numeric parsing is explicit, and defaults are documented in code through the schema.

Weakness: the schema is strong, but configuration is still one large flat namespace. As operational surfaces grow, grouped configuration objects or module-local config factories may improve ownership and reduce the cognitive load of global env review.


# App Module: 95/100
Strength: `AppModule` wires the platform coherently, with global environment validation, Redis-backed cache configuration, GraphQL setup, throttling, auth/roles/throttle guards, request context, logging, subscriptions, ops, outbox, metrics, and all feature modules registered in one predictable composition root. The module keeps application-level concerns centralized while leaving business behavior inside feature services.

Weakness: the composition root is still conventional NestJS wiring rather than a richer runtime capability layer. As deployment profiles grow, this area may need clearer module grouping, startup capability reporting, or environment-specific import boundaries to keep global wiring easy to audit.


# Bootstrap / Security Setup: 94/100
Strength: application startup keeps global concerns centralized: GraphQL config, throttling, global guards, cache setup, env validation, and security/bootstrap helpers are separated from feature modules. The app remains protected by default through global GraphQL JWT and roles guards, with public resolver opt-out handled intentionally.

Weakness: this layer is mostly conventional NestJS infrastructure. It does not yet express a deeper deployment profile model, runtime capability report, or richer security policy surface beyond the existing bootstrap and guard setup.


# Shared/Common: 98/100
Strength: strong shared infrastructure for pagination, caching helpers, validation, auth guards, GraphQL error shaping, throttling, password security, request context, structured logging, and `runBestEffort` patterns gives the codebase a disciplined backbone. The common layer supports both request/GraphQL flows and the outbox-enabled runtime without forcing feature modules into ad hoc infrastructure code.

Weakness: cache invalidation correctness still depends heavily on service discipline rather than stronger centralized enforcement, and the shared observability baseline still stops short of tracing and broader cross-module operational instrumentation. Current metrics are valuable but focused on outbox/feed projection behavior.


# Prisma Module: 94/100
Strength: `PrismaModule` is a small global provider module that exposes one shared `PrismaService` across the application, which keeps feature modules from creating ad hoc Prisma clients or accidental extra connection pools. `PrismaService` owns lifecycle connection and disconnect behavior through Nest module hooks and stays intentionally thin.

Weakness: the module is infrastructure-minimal. It does not add query instrumentation, transaction helpers, connection health metadata, or Prisma middleware for cross-cutting concerns such as timing, audit hooks, or safer logging.


# Prisma Schema/Data Layer: 98/100
Strength: the schema supports roles, privacy, account states, richer nullable profile fields, avatar media references, refresh sessions, email verification, password reset, follow requests, moderation actions, notifications, notification preferences, per-actor notification preferences, media, blocks, scoped mutes, mentions, hashtags, one-level threaded comments, durable outbox events, and now persisted home-feed entries. `HomeFeedEntry` has the right v1 shape for deterministic chronological reads, duplicate protection, relationship hiding, post cleanup, and retention work, with indexes aligned to feed reads and cleanup patterns. `Hashtag` and `PostHashtag` add normalized slug storage, duplicate-safe post/tag links, public-scope counts, and indexes for prefix discovery and chronological posts-by-tag reads. Recent work improved correctness through follow-request transition safety, comment counter consistency, media attachment ordering, session index alignment, stronger report dedup handling, persisted outbox-backed notification delivery, projected home-feed fanout, indexed mute relationships, per-actor notification silence, and profile-avatar storage linkage.

Weakness: the `ContentReport` "exactly one of postId/commentId" invariant still needs a reviewed MySQL migration/constraint to be fully database-enforced, and the domain model is still incomplete for a fuller social platform, especially around richer preferences, discovery, recommendation/feed ranking, and advanced moderation relationships.


# GraphQL Error/Config Layer: 98/100
Strength: sanitized public error mapping, global guard/config discipline, websocket auth integration, tested query-complexity infrastructure, the corrected non-recursive reply contract, and working realtime notification subscription plumbing are all strong. This layer remains strong because GraphQL bad-request transport handling is more correct and because websocket/auth/config paths now coexist with durable worker-owned notification delivery and projected feed reads.

Weakness: some API payloads still reflect backend workflow shapes more than polished product-facing contracts, and the home-feed surface will likely need richer viewer-relative state, ranking metadata, or feed explanations over time.


# Pagination and Shared Args/DTO Utilities: 96/100
Strength: shared chronological cursor pagination with deterministic ordering, shared caps, and broad reuse remains one of the strongest parts of the project. Root-only threaded comment pagination, the dedicated home-feed page contract, and projection reads that preserve cursor semantics all reinforce that strength.

Weakness: there are still a few older or feature-specific patterns around the shared model, so pagination is not perfectly uniform everywhere.


# Operational / Observability Layer: 97/100
Strength: this area is materially stronger than the earlier project state. The project has liveness/readiness endpoints, dependency-aware readiness checks for DB/cache/pubsub, structured application logging, request/correlation IDs, boot-complete tracking, direct test coverage for the operational wiring, a dedicated Prometheus-compatible metrics server, and a durable async processing surface through the outbox module with aggregate and event-type-aware backlog visibility exposed in readiness and metrics. Home-feed projection purge, worker gating, shadow compare metrics, cleanup enqueue metrics, Prometheus alert rules, a Grafana dashboard, and an outbox backlog runbook give the background-processing story a more realistic operational shape.

Weakness: despite the improvement, the layer is still not production-complete. Metrics are now real but scoped mostly to outbox/feed projection behavior, and there is still no distributed tracing posture, broad request/cache/Prisma metrics, richer SLO ownership model, broad job taxonomy beyond the current outbox cases, or production deployment manifests for scrape target/network policy wiring. Relative to the maturity of the product/backend logic, tracing and broader cross-module instrumentation are now the main remaining ops gaps.
