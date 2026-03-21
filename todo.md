# TO COMPARE BRANCHES IN THE CURSOR:
via the Source Control icon - better
via the GitLens Inspect


# AFTER EVERYTHING IS DONE:
- ADD DOCKER
- ADD GIT LAB
- CREATE AN BIG AND WELL EXPLAINING PROMPT TO CODEX CREATE README.MD FILE - ASKS IF GRAPHQL QUERIES SHOULD BE INSIDE THE FILE
- UPDATE THE .GITIGNORE FILE


//---//---//---// //---//---//---//


# NEXT FEATURE

- No password reset.

- implement cursor pagination

- use denormalized post counters consistently

- stop synchronously incrementing views on hot reads



//---//---//---// //---//---//---//


# TO FIX:

WHERE THERE IS TWO ConfigModule HERE:
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [NestFactory] Starting Nest application...
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] PassportModule dependencies initialized +20ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] PrismaModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] ConfigHostModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] ThrottlerModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] **ConfigModule** dependencies initialized +28ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] **ConfigModule** dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] PasswordModule dependencies initialized +1ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] GraphqlSubscriptionsModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] JwtModule dependencies initialized +1ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] AppModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] NotificationsModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] GraphQLSchemaBuilderModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] CacheModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] CacheHelpersModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] AuthModule dependencies initialized +1ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] UsersModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] PostsModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] LikesModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] FollowsModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] CommentsModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [InstanceLoader] GraphQLModule dependencies initialized +0ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [GraphQLModule] Mapped {/graphql, POST} route +97ms
[Nest] 252137  - 03/20/2026, 9:55:41 PM     LOG [NestApplication] Nest application successfully started +2ms






# QUESTIONS:



# The Problem:
Replace in-memory pubsub with Redis-backed or broker-backed realtime.


# ABOUT THE NEW IMPLEMENTATION:
1. **Current-state assessment**
Today subscriptions were using a process-local `PubSub` singleton in `src/graphql/subscriptions/pubsub.ts`. Notifications were persisted in `notifications.service.ts`, then best-effort published from memory, and `notifications.resolver.ts` subscribed directly to that same in-memory bus. The `graphql-ws` auth handshake in `subscriptions.config.ts` and the recipient filter in `notifications.resolver.ts` were already correct for auth and filtering, and did not need semantic changes.

Redis-backed pubsub is the best fit for this codebase right now. It preserves the existing GraphQL subscription API and developer experience, matches the project’s existing Redis usage, and fixes the multi-instance delivery problem without forcing a larger broker/outbox refactor.


2. **Target realtime architecture**
I kept notifications in the database as the source of truth and replaced only the realtime acceleration layer.

The new shape is:
- `NotificationsService` persists the notification first, then best-effort publishes through an injected `GraphqlPubSubService`.
- `NotificationsResolver` still exposes `notificationReceived`, but now gets its async iterator from the same injected service.
- `GraphqlPubSubService` wraps a Redis-backed `RedisPubSub` engine built from dedicated `ioredis` publisher/subscriber clients.
- `GraphqlSubscriptionsModule` centralizes the provider and is wired once in `app.module.ts`.

I did not change:
- subscription auth handshake behavior
- recipient filtering semantics
- notification persistence flow
- best-effort publish semantics


3. **Packages/dependencies to add or change**
Added:
- `graphql-redis-subscriptions`
- `ioredis`

Kept:
- `graphql-subscriptions`
- existing `graphql-ws` transport
- existing `REDIS_URL` pattern


4. **File-by-file plan**
- Replace the in-memory pubsub singleton with a Redis-backed Nest provider.
- Inject that provider into notifications service and resolver.
- Wire the provider module into app startup.
- Extend env validation with optional subscription-specific Redis settings.
- Update tests around notifications and add focused pubsub service tests.


5. **Exact changes by file/module**
`src/graphql/subscriptions/graphql-pubsub.service.ts`
- New Redis-backed pubsub service using `RedisPubSub`.
- Creates dedicated `ioredis` publisher/subscriber clients.
- Uses namespaced triggers.
- Uses Node `v8` serialization encoded as base64 so payload Dates survive Redis transit.
- Logs Redis connection errors and closes clients on module shutdown.

`src/graphql/subscriptions/graphql-subscriptions.module.ts`
- New global module exporting `GraphqlPubSubService`.

`src/graphql/subscriptions/pubsub.ts`
- Removed the in-memory singleton.

`src/notifications/notifications.service.ts`
- Replaced direct `pubSub.publish(...)` with injected `GraphqlPubSubService`.
- Kept publish as best-effort after the DB write succeeds.

`src/notifications/notifications.resolver.ts`
- Replaced direct `pubSub.asyncIterableIterator(...)` with injected `GraphqlPubSubService`.
- Left the recipient filter logic unchanged.

`src/app.module.ts`
- Added `GraphqlSubscriptionsModule` to app wiring.

`src/config/env/env.schema.ts`
- Added optional `GRAPHQL_SUBSCRIPTIONS_REDIS_URL`.
- Added `GRAPHQL_SUBSCRIPTIONS_REDIS_NAMESPACE` with default `graphql-subscriptions`.

`src/config/env/env.schema.spec.ts`
- Added coverage for the new namespace default.

`src/notifications/notifications.service.spec.ts`
- Replaced singleton spying with an injected `GraphqlPubSubService` mock.

`src/graphql/subscriptions/graphql-pubsub.service.spec.ts`
- New focused unit tests for Redis client creation, namespacing, delegation, and shutdown logging.

`package.json` / `package-lock.json`
- Added the Redis pubsub dependencies.


6. **Full updated files or diffs**
High-signal diff summary:
```diff
- src/graphql/subscriptions/pubsub.ts
+ src/graphql/subscriptions/graphql-pubsub.service.ts
+ src/graphql/subscriptions/graphql-subscriptions.module.ts

- import { pubSub } from "@/graphql/subscriptions/pubsub";
+ import { GraphqlPubSubService } from "@/graphql/subscriptions/graphql-pubsub.service";

- await pubSub.publish("notificationReceived", payload)
+ await this.graphqlPubSub.publish("notificationReceived", payload)

- return pubSub.asyncIterableIterator("notificationReceived")
+ return this.graphqlPubSub.asyncIterableIterator("notificationReceived")

+ GRAPHQL_SUBSCRIPTIONS_REDIS_URL?: string
+ GRAPHQL_SUBSCRIPTIONS_REDIS_NAMESPACE=graphql-subscriptions

+ graphql-redis-subscriptions
+ ioredis
```


7. **Environment/config changes**
New env behavior:
- `REDIS_URL` remains required and is still the default Redis endpoint.
- `GRAPHQL_SUBSCRIPTIONS_REDIS_URL` is optional and overrides `REDIS_URL` only for subscription pubsub.
- `GRAPHQL_SUBSCRIPTIONS_REDIS_NAMESPACE` is optional and defaults to `graphql-subscriptions`.

Practical default:
- If you already have one Redis for cache, you can ship this with only `REDIS_URL`.
- If you later want subscription isolation, set `GRAPHQL_SUBSCRIPTIONS_REDIS_URL`.


8. **Any follow-up tasks or tradeoffs**
This is the best practical production-minded step for the current codebase. Longer term, if you need stronger delivery guarantees across services or cross-domain event fanout, the next step would be an outbox/broker approach. I did not implement that because it would be a broader architectural change than this repo needs for the stated goal.


Verification completed:
- Focused tests passed: `graphql-pubsub.service.spec.ts`, `subscriptions.config.spec.ts`, `notifications.service.spec.ts`, `env.schema.spec.ts`
- ESLint passed on touched files
- `npm run build` passed


Not done:
- No live runtime test against a real Redis instance from this session
- I left the unrelated existing `todo.md` worktree change untouched







//---//---//---// //---//---//---//


# Current Operation Signatures

Queries
users(take?: Int, orderBy?: ChronologicalOrder): [SafeUser!]!
userById(id: Int!): SafeUser!
posts(take?: Int, orderBy?: ChronologicalOrder, q?: String): [Post!]!
postById(id: Int!): PostDetail!
myFeed(take?: Int, orderBy?: ChronologicalOrder): [Post!]!
likes(take?: Int, orderBy?: ChronologicalOrder, postId?: Int, userId?: Int): [LikeListItem!]!
likeById(id: Int!): LikeListItem!
myNotifications(take?: Int, orderBy?: ChronologicalOrder, status?: NotificationReadStatus): [NotificationDTO!]!
unreadNotificationsCount: Int!
follows(take?: Int, orderBy?: ChronologicalOrder): [Follow!]!
followById(id: Int!): Follow!
commentsByPost(take?: Int, orderBy?: ChronologicalOrder, postId: Int!): [SafeCommentDTO!]!\

Mutations
login(input: LoginInput!): AuthPayload!
createUser(input: CreateUserInput!): SafeUser!
updateMe(input: UpdateUserInput!): SafeUser!
deleteMe: DeleteResponse!
createPost(input: CreatePostInput!): Post!
updatePost(id: Int!, input: UpdatePostInput!): Post!
deletePost(id: Int!): DeleteResponse!
createLike(postId: Int!): LikeListItem!
deleteLike(id: Int!): DeleteResponse!
markNotificationAsRead(notificationId: Int!): DeleteResponse!
markAllNotificationsAsRead: DeleteResponse!
createFollow(followingId: Int!): Follow!
deleteFollow(id: Int!): DeleteResponse!
createComment(input: CreateCommentInput!): SafeCommentDTO!
deleteComment(commentId: Int!): DeleteResponse!

//---//---//---// //---//---//---//