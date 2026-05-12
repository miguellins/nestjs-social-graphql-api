# Notification preferences — implementation plan (v1)

This plan is the source of truth for notification preference work. Selected decisions below are locked; implementation work should follow them and AGENTS.md.

## Goal

Extend notification preferences so users can opt out of additional in-app notification categories, keep behavior predictable for clients and ops, and stay consistent with existing patterns (thin resolvers, service-owned rules, Prisma safety, cache keys, subscriptions as delivery acceleration).

## Locked decisions (authoritative)

1. **Likes and new followers in v1** — Add user toggles for `POST_LIKED` and `USER_FOLLOWED` in the same release as the rest of this prefs work.

2. **Mention grouping** — Keep one toggle that applies to both `POST_MENTIONED` and `COMMENT_MENTIONED` (current mapping in `isNotificationTypeEnabled`).

3. **New field names** — Prisma and GraphQL use enum-aligned names: `postLikedNotificationsEnabled` and `userFollowedNotificationsEnabled`.

4. **Service validation** — Add a Zod command schema for updating preferences and parse with `parseWithBadRequest` in the service, while keeping `class-validator` on the GraphQL input.

5. **Empty patch mutation** — If the client omits all updatable fields, reject with a validation error (no silent no-op).

6. **Historical rows** — Disabling a category does not hide or delete existing notification rows; preferences only block **new** notifications of that category.

7. **Realtime vs persistence** — Preferences always gate **persistence** (no “store but suppress websocket” mode in v1).

8. **Defaults** — New boolean columns default to `true` so behavior matches “notifications on” today for existing and new users.

9. **Backward compatibility** — New output fields are non-null with server-side defaults; update input remains a partial patch (optional fields per toggle).

10. **Row materialization** — No mass backfill job required; rely on upsert and in-code defaults when no `NotificationPreference` row exists (lazy materialization).

11. **Cache invalidation failure** — If best-effort cache delete after update fails, accept possible stale reads until the existing TTL expires (current pattern).

12. **Type-to-toggle mapping in API** — Do not add a GraphQL metadata/catalog query; document the `NotificationType` → preference field mapping in human-readable feature documentation when the feature ships.

13. **Auth** — Only the authenticated user may read or update their own preferences (unchanged from current API posture).

14. **Logging and privacy** — Do not rely on per-user info logs for suppression; emit low-cardinality aggregate metrics (e.g. counter with `reason="prefs"`, name aligned with existing metrics conventions such as `notification_suppressed_total`).

15. **Throttling** — Keep `myNotificationPreferences` on the `READ` category and `updateNotificationPreferences` on the `MUTATION` category (current resolver throttles).

16. **Operations** — Track update-mutation error rate and cache behavior relevant to preference keys (e.g. miss rate where the stack exposes it); wire new counters through the existing `MetricsRegistryService` / prom-client pattern rather than ad hoc logging.

17. **Testing** — Unit tests on `NotificationPreferencesService` and on `NotificationsService` preference gating inside `createNotification` (and related paths); no requirement for new GraphQL e2e for this feature in v1.

18. **Rollout** — Ship application changes and the database migration that adds columns together in one deploy window (additive columns with defaults).

19. **Audit trail** — No stored audit log of preference changes in v1.

20. **i18n** — User-visible labels for settings live in clients; API returns booleans (and existing enum names where relevant).

21. **Other channels** — Email/push (or other channels) are explicitly out of scope for v1; “notification” here means the in-app notification row and its delivery path used today.

22. **Client UX** — First-party clients should use pessimistic UI for toggles (wait for successful mutation before committing the visual state). Backend does not enforce this; it is a client contract note.

## Scope of work (when implementing; not done in this document)

### Data model

- Add two boolean columns on `NotificationPreference` with Prisma defaults `true`, names `postLikedNotificationsEnabled` and `userFollowedNotificationsEnabled`.
- Migration generation and review are required before production but are **out of scope for this plan file edit** (per repo workflow).

### Domain and enforcement

- Extend `isNotificationTypeEnabled` to map `POST_LIKED` and `USER_FOLLOWED` to the new fields; keep mention behavior as a single toggle for both mention types.
- Keep enforcement in `NotificationsService.createNotification` so blocked types never persist and therefore never publish subscription payloads (aligns with decision 6–7).

### GraphQL

- Extend `NotificationPreferences` object type and `UpdateNotificationPreferencesInput` with the two new optional boolean input fields; extend output with two new non-null booleans with defaults from DB/code defaults.
- Enforce decision 5 at the boundary (DTO and/or Zod) so an empty patch is invalid.

### Service layer

- Introduce a Zod schema under `src/notifications/schemas/` for the update command; parse in `NotificationPreferencesService.updateMyPreferences` with `parseWithBadRequest`.
- Keep Prisma updates as explicit partial assigns (no unchecked spread of user input).

### Cache

- Extend `notificationPreferencesSelect` and default object used when no row exists.
- Keep key shape `user:notificationPrefs:${userId}` (or evolve only if a documented reason appears); continue detail-key delete on successful update, with decision 11 on failure.

### Metrics

- Register a small counter (or reuse a pattern) in `MetricsRegistryService` for suppressions with label `reason="prefs"` (and any other low-cardinality labels required by existing naming conventions).
- Add observability notes for mutation errors and preference cache key behavior per decision 16.

### Documentation (at implementation time, per AGENTS.md)

- Human mapping of each `NotificationType` to preference fields lives in the notifications feature doc (create or update under `docs/` as appropriate), plus updates to `docs/reviews/backend-maturity-review.md` and `docs/reviews/module-review.md` in the same change as code.

### Testing (per decision 17)

- Service specs: new columns default and switch behavior; `updateMyPreferences` rejects empty Zod/command input.
- `NotificationsService` specs: when preferences return false for a type, `createNotification` does not create a row (and metrics hook if added).

## Explicitly out of scope (v1)

- Email, push, SMS, or per-channel matrices (decision 21).
- Subscription-only suppression without persistence (decision 7).
- Server-driven localized strings for preference labels (decision 20).
- GraphQL catalog of toggles (decision 12).
- Audit storage for preference changes (decision 19).
- Admin/support read or reset APIs (decision 13 remains “self only”).

## Consistency check

- Decisions 1–22 are mutually consistent with each other and with AGENTS.md themes: thin resolvers, service-owned validation, no wildcard cache clears, subscriptions after persistence, safe GraphQL shapes, and tests tied to changed service behavior.
