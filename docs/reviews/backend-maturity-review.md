# 1. Executive Summary

This backend is now a **credible early product backend with a real operational baseline, an initial durable async foundation, and an emerging feed-projection path**. It is still not a full social-media platform backend, but it is materially stronger than the previous assessment in platform breadth, operational posture, and backend maturity.

What is materially stronger now:
- Real operational endpoints exist:
  - `GET /health/live`
  - `GET /health/ready`
- Readiness is dependency-aware and includes:
  - database probe
  - cache probe
  - Redis-backed GraphQL pubsub probe
  - timeout handling
  - readiness summary flags for Redis/pubsub wiring
  - report-only outbox backlog summary with event-type-aware breakdowns and an `unknown` rollup
- Structured logging exists through `AppLoggerService`
- Request correlation exists through `RequestContextMiddleware` and `RequestContextService`
- GraphQL context carries request and operation metadata explicitly
- GraphQL bad-request transport behavior is cleaner:
  - invalid input coercion maps to `BAD_REQUEST`
  - nested missing required input is sanitized
  - schema-validation failures return proper HTTP `400`
- The repo has direct tests for these infrastructure paths
- Prometheus-compatible metrics now exist for the outbox and home-feed
  projection paths, with alert rules, a Grafana dashboard, and a backlog
  runbook
- The platform has a real durable async slice:
  - outbox-backed comment-reply notification delivery
  - outbox-backed follow-request notification delivery
  - registry-routed durable event handlers for current notification and feed work
  - dedicated outbox worker service
  - retry/backoff and failure states
  - outbox health summary in readiness
- The feed architecture has moved beyond request-time reads only:
  - home-feed projection events exist
  - a feed projection service performs fanout, follow backfill, user bootstrap, cleanup, relationship soft-hide, and retention purging
  - projected reads can be enabled behind environment flags
  - shadow comparison exists for safer rollout

Biggest current strengths:
- Clean feature-based NestJS module split with thin resolvers and service-owned behavior
- Good defensive patterns:
  - validated env
  - GraphQL auth-by-default guard stack
  - role-aware authorization
  - throttle categories
  - safe Prisma selects near DTO/model definitions
  - sanitized GraphQL error shaping
- Real cursor pagination contracts
- Strong cache invalidation discipline with targeted detail invalidation and version-key list invalidation
- Redis-backed subscription transport
- Credible auth lifecycle:
  - refresh rotation
  - session inventory and revocation
  - password reset
  - email verification
  - JWT role and session propagation
  - account-state enforcement
- Stronger trust/safety than a typical project at this stage:
  - blocks
  - scoped mutes, including durable projection cleanup when FEED scope is added
  - reports
  - moderation review/actions
  - moderator takedowns for posts/comments
  - suspension/reactivation
- Product-domain credibility:
  - private-account follow requests
  - bookmarks
  - media upload and attachment flows
  - richer public profiles with bio, website, location, viewer-aware profile
    visibility, owner profile reads, and profile-avatar upload wiring
  - one-level comment replies
  - mentions
  - normalized hashtags with `postsByHashtag` and `searchHashtags`
  - hashtag backfill/reconciliation script and runbook for historical join and count drift
  - in-app notification preferences for replies, follow requests, mentions, post likes, reposts, quotes, and new followers
  - per-actor notification silence and a unified interaction-preferences read
  - dedicated `myFeed` and `homeFeed` surfaces
  - durable notifications before realtime publish for reply and follow-request flows
  - repost/share/quote flows that reuse post rows and feed fanout
  - early durable feed projection path
- Testing remains above average for the maturity level

Biggest current weaknesses:
- The product model is still narrow relative to a real social platform
- Feed and discovery architecture are improved but still early-stage
- Durable async processing exists now, but coverage is still selective
- Metrics now cover outbox/feed projection plus GraphQL operations, cache helper results, Prisma query outcomes/duration, auth failures, and throttle rejections. OpenTelemetry tracing is available with OTLP HTTP export, active-span trace/log correlation, worker spans, and sampled cache spans
- The former oversized core services have been split into slimmer facades plus feature-private collaborators; a few cohesive collaborators remain above the soft line guideline and can be split further if their responsibilities grow

# 2. Current Maturity Assessment

**Maturity level: Strong Intermediate to Early Product-Grade Foundation**

Why this is stronger than the previous state:
- The backend now has a credible operational posture
- It has:
  - health/liveness/readiness
  - structured logs
  - request correlation
  - tested GraphQL transport/error normalization improvements
  - an initial outbox-backed async processing path
  - a gated home-feed projection path with outbox-backed fanout/backfill/cleanup events
  - event-type-aware outbox readiness reporting that stays report-only for backlog

Where it feels strong:
- Service/resolver split
- Validation layering with `class-validator` and Zod
- Safe DTO/model exposure
- Redis-backed subscriptions
- Media upload and attachment workflow
- Cursor pagination and page contracts
- Auth/session lifecycle
- Privacy-aware visibility
- Follow-request workflow
- Moderation/account-state foundations
- Mentions and threaded one-level replies
- Dedicated feed API surface
- V1 hashtag discovery through `postsByHashtag` and `searchHashtags`
- Operational baseline is credible
- Durable async delivery exists for important reply and follow-request notification paths
- Feed projection work has started with guarded rollout controls
- Outbox/readiness reporting now separates known event types from unknown producers

Where it still feels MVP-like:
- Feed projection exists, but it is not yet a mature ranked/recommendation subsystem
- Durable async processing is not yet a broad platform pattern across all post-commit work
- Application metrics now include GraphQL latency/outcomes, cache helper hit/miss/write/error results, Prisma query timing/outcomes, auth failures, and throttle rejections, with optional OpenTelemetry tracing and trace/log correlation
- Limited integration/e2e depth
- Large core services still carry too much coordination logic

# 3. Critical Missing Pieces

Highest-priority remaining gaps after the current ops, outbox, and feed-projection work:
- The product model is still incomplete for a realistic social platform:
  - stronger discovery beyond v1 hashtag autocomplete
- Feed maturity is still limited:
  - dedicated `myFeed` and `homeFeed` surfaces exist
  - home-feed projection/fanout infrastructure exists
  - but there is no ranking, recommendation blend, search-backed discovery, or mature feed evaluation loop
- Observability is improved but still needs production baselines:
  - health checks exist
  - structured logs exist with request IDs and active span correlation
  - GraphQL/cache/Prisma/guard/outbox/feed-projection metrics exist
  - application and outbox alert rules plus Grafana dashboards exist
  - OpenTelemetry tracing exports over OTLP HTTP when configured
- Durable async processing is still selective:
  - the outbox exists
  - notification delivery uses it for selected flows
  - home-feed projection uses it for selected fanout/backfill/cleanup and relationship-hide flows
  - handler registration is now reusable, but coverage is still intentionally narrow
  - but it is not yet the default system event pipeline

# 4. Senior-Level Improvement Opportunities

Best remaining improvements, excluding any single top feature:
- Deepen the current feed boundary into a clearer feed subsystem with explicit projection ownership, rollout health, and correctness baselines
- Tune the broadened metrics/tracing baseline with production traffic thresholds and collector-specific dashboards
- Extend the outbox pattern to more post-commit delivery work where retries matter
- Keep the new facade/collaborator boundaries healthy and split cohesive collaborators further only when responsibilities grow
- Build richer trust-and-abuse workflows on top of the existing moderation/report/block/account-state base
- Expand richer profile/preferences/discovery surfaces

# 5. Real-World Social Media Feature Gaps

Still missing for a realistic MVP:
- Profile extensions beyond the v1 bio, website, location, and avatar surface
- Notification preferences are still in-app only and do not yet model push/email channels, digests, or quiet hours
- Mute controls still lack expiration, bulk operations, and automatic projection un-hide
- More realistic discovery surfaces beyond hashtag prefix search; V1 MySQL-native `searchPosts` and `searchUsers` now exist, but unified discovery, trending, typo tolerance, and external search infrastructure remain future work
- Broader moderation console/operator workflow

Still missing for a more mature platform:
- Search/discovery infrastructure beyond hashtag autocomplete; V1 uses MySQL FULLTEXT while external search infrastructure remains future work
- Ranked home feed
- Recommendation infrastructure
- Push/email fanout beyond current channels
- Broader outbox/event coverage beyond the current notification and feed-projection slices

# 6. Module and Platform Review Update

**Ops / Infrastructure**
- Improved:
  - `HealthController` and `HealthService` provide real liveness/readiness behavior
  - readiness checks cover database, cache, pubsub, and report-only outbox summary
  - outbox readiness summary is event-type-aware for all known event types, with an `unknown` bucket for unexpected producers
  - `AppLoggerService` provides structured request-aware logs and includes active `traceId` / `spanId` fields when tracing is enabled
  - `RequestContextMiddleware` and `RequestContextService` provide request IDs and operation correlation
  - bootstrap wires logger, request context, filters, validation, security, and boot-complete tracking explicitly
  - `MetricsModule` exposes Prometheus-compatible metrics on a dedicated
    internal endpoint when enabled
  - metrics now cover GraphQL operations, cache helper operations, Prisma queries, auth failures, throttle rejections, notification suppressions, outbox, and feed projection
  - OpenTelemetry tracing is available through OTLP HTTP export with HTTP, Nest, GraphQL, Redis, Prisma, worker, and sampled cache spans
  - application and outbox/feed-projection alert rules, Grafana dashboards, and runbooks exist
- Still missing:
  - production traffic baselines for broader SLOs
  - collector/backend-specific dashboard tuning
  - production deployment manifests for scrape targets and collector routing

**GraphQL Infrastructure**
- Improved:
  - bad-request transport behavior is more correct and more client-friendly
  - nested missing-input coercion is sanitized properly
  - schema-validation failures correctly present as `BAD_REQUEST` with HTTP `400`
  - context carries request and operation metadata across HTTP and subscriptions
- Result:
  - GraphQL infrastructure is more frontend-usable and more operationally sane than the previous review captured

**Posts / Feed**
- Improved:
  - dedicated `myFeed` and `homeFeed` surfaces exist
  - cleaner read and write boundaries through `PostListReadService`, `PostReadService`, `PostWriteService`, `PostModerationService`, and `PostCacheService`
  - privacy/follow/block/mute/account-state-aware reads remain in place
  - content hashtags are normalized into durable `Hashtag` and `PostHashtag`
    rows during post writes
  - `postsByHashtag` reuses the existing post page shape with visibility,
    block, mute, pagination, and cache behavior aligned with post list reads
  - `searchHashtags` provides a minimal v1 discovery/autocomplete surface
    ordered by public-scope `postsCount`
  - `HomeFeedProjectionService` now supports fanout, follow backfill, user bootstrap, cleanup, soft-hide, and retention purging
  - `HomeFeedOutboxHandler` routes feed projection events through the durable outbox worker path
  - mutes are now scoped by FEED, POSTS, COMMENTS, and NOTIFICATIONS, with FEED additions enqueueing durable relationship-hide work so projected rows for muted authors are soft-hidden
  - projected home-feed reads can be enabled behind feature flags and compared against legacy reads through shadow comparison
  - projection read rollout has explicit allow/deny user gates, configurable fallback behavior, hashed shadow diagnostics, and a read-lag metric
  - feed-projection outbox rows are visible by concrete event type in readiness, while backlog remains report-only
- Still weak:
  - feed architecture remains early-stage
  - no ranking or recommendation blend yet
  - hashtag backfill/reconciliation now has a reviewed dry-run/apply maintenance path, but still needs to be run against real historical data

**Notifications / Async**
- Improved:
  - persistence-before-publish remains intact
  - trigger/delivery split exists
  - Redis-backed realtime remains in place
  - mention, reply, and follow-request notifications exist
  - NOTIFICATIONS-scope muted actors are suppressed or filtered in notification creation, realtime delivery, and notification reads
  - per-actor notification silence suppresses new persistence and delayed realtime delivery without retroactively hiding existing notification rows
  - `myInteractionPreferences` gives clients a unified read for global notification preferences, muted users, and silenced actors
  - reply and follow-request delivery have outbox-backed durable worker paths
  - feed projection now also uses outbox events for fanout/backfill/bootstrap/cleanup and relationship-hide work
- Still missing:
  - broader retry/state coverage across more notification types
  - a generalized durable event pipeline across the system
  - richer channel preferences
  - broader async metrics beyond the current outbox/feed-projection slice

# 7. Updated Security and Moderation Review

Current protections are stronger than the previous writeup implied because the project now also has:
- structured request correlation
- better operational visibility through health/readiness
- cleaner bad-request transport behavior for GraphQL clients
- explicit account-state modeling
- block-aware visibility and notification suppression
- scope-aware mute filtering across feed, post, comment, bookmark, hashtag, and notification surfaces

Still missing:
- expiration, bulk management, channel preferences, and richer notification scheduling controls
- broader anti-abuse tooling
- richer moderation workflows like appeals, escalations, and operator UX

# 8. Updated Infrastructure and Ops Review

Current state:
- Health/readiness endpoints: present
- Structured logs: present
- Request IDs / correlation IDs: present
- Boot-complete tracking for liveness: present
- Dependency-aware readiness checks: present
- Outbox backlog visibility in readiness: present, with event-type-aware `byEventType` buckets and an `unknown` rollup
- Durable async worker path: present
- Home-feed projection worker path: present, gated by feature flags
- Prometheus-compatible metrics endpoint: present, scoped to outbox/feed
  projection health
- Initial alert rules and Grafana dashboard for outbox/feed projection: present, including event-type-oriented views
- Outbox backlog runbook: present

Still missing:
- Tracing
- Broader request/cache/database metrics and dashboards
- Broader queue/worker coverage
- A generalized durable outbox/event pipeline across more modules
- Broader runtime/deployment posture
- Media-processing pipeline beyond current upload/storage flow
- Production-tuned baselines for feed projection lag, shadow mismatches, and
  event-type backlog health

# 9. Updated Testing and Observability Review

Testing maturity is stronger than the previous review stated because the repo has direct tests for:
- health controller/service
- structured logger bootstrap/service
- request-context middleware/service
- GraphQL bad-request plugin
- GraphQL config behavior around sanitized error transport
- outbox service, worker, processor, and notification handler paths
- event-type-aware outbox readiness summary behavior
- follow-request notification delivery through direct and outbox-backed paths
- feed read behavior
- home-feed outbox processor behavior
- mutes service/resolver behavior and scope-aware mute filtering paths
- hashtag parsing, transactional hashtag sync, counter deltas, and hashtag
  post visibility/cache behavior

Observability maturity is now:
- early but real
- no longer mostly absent
- stronger for the outbox/feed-projection path because metrics, alerts, a
  dashboard, event-type readiness reporting, and a backlog runbook now exist
- still below production-grade because tracing, request/cache/database metrics,
  and production traffic SLO baselines are missing for any future deployed environment

# 10. Prioritized Roadmap

**Phase 1**
- Run hashtag backfill/reconciliation in canary ranges for real historical data
- Broaden metrics and add tracing
- Expand the outbox pattern beyond the current notification and feed-projection slices
- Deepen session/device management
- Expand moderation/operator workflows
- Keep extracting focused helpers from oversized services

**Phase 2**
- Richer profiles and preferences
- Notification preferences
- Discovery V1 rollout validation for MySQL FULLTEXT post/user search, followed by richer discovery improvements beyond the current separate search operations
- Media lifecycle expansion
- Contract refinements for frontend ergonomics

**Phase 3**
- Ranked feed
- Search/discovery infrastructure
- Recommendation systems
- More advanced moderation tooling
- Broader platform-scale observability
- Wider durable event-driven processing

# 11. Final Verdict

This codebase is now a **credible early product backend foundation with a real operational baseline, a first durable async slice, and an emerging durable feed-projection path**.

The biggest change versus the previous assessment is this:
- the backend is no longer missing basic operational posture
- it is no longer completely missing durable async infrastructure
- feed work is no longer only request-time querying
- it now has a real baseline for health, structured logging, request correlation, improved GraphQL transport correctness, outbox-backed worker paths for selected notification delivery, and gated feed projection events
- readiness now exposes report-only event-type outbox state, including unknown producer detection, without changing liveness/readiness dependency semantics

The biggest remaining gaps are now:
- incomplete platform/domain breadth
- still-immature feed/discovery architecture despite projection and v1 hashtag progress
- selective rather than broad durable async processing
- metrics and readiness signals that are useful but still scoped mainly to outbox/feed projection, and no tracing
- formerly oversized core services now use slimmer facade/collaborator boundaries, with remaining pressure mostly in cohesive credential/request/write collaborators

So the project has moved from "good MVP backend with thin ops posture" toward "credible early product backend with real operational baseline, an initial durable async backbone, and an early feed-projection foundation, but still lacking broader platform maturity."
