# AFTER EVERYTHING IS DONE:

- ADD DOCKER
- ADD GIT LAB
- CREATE AN BIG AND WELL EXPLAINING PROMPT TO CODEX CREATE README.MD FILE - ASKS IF GRAPHQL QUERIES SHOULD BE INSIDE THE FILE
- UPDATE THE .GITIGNORE FILE

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
//---//---//---// //---//---//---//

# ABOUT ZOD VALIDATION:

Reset all data from DATABASE
Check all Queries and Mutations:
Test everything

//---//---//---// //---//---//---//
//---//---//---// //---//---//---//

## Prompt for Clean Up

//---//---//---// //---//---//---//
//---//---//---// //---//---//---//

# About Zod:

Consider Zod later for:
reusable service/domain command schemas in users and posts, if you want to eliminate repeated normalization and support more than just GraphQL entry points

The best long-term structure for this codebase is hybrid:

- GraphQL code-first classes remain the transport/schema layer.
- Zod becomes the runtime parsing layer for unknown data and reusable domain contracts.
- Env validation moves to Zod immediately.

What changed:

- Added centralized env validation in env.schema.ts and wired it into app.module.ts. Your app now validates required env vars and coerces numeric/boolean config at startup.
- Moved jwt.strategy.ts off direct process.env reads and onto ConfigService, which is cleaner and aligned with the new env validation.
- Added Zod runtime parsing for websocket connection params in subscription-connection-params.schema.ts and integrated it into subscriptions.config.ts.
- Added a Zod-backed internal notification contract in create-notification.schema.ts, and notifications.service.ts now validates payloads before touching Prisma. The existing type alias in create-notification.input.ts remains as the stable import surface.

//---//---//---// //---//---//---//
//---//---//---// //---//---//---//

//---//---//---// //---//---//---//
//---//---//---// //---//---//---//

//---//---//---// //---//---//---//
//---//---//---// //---//---//---//

### Recommended Architecture

//---//---//---// //---//---//---//
//---//---//---// //---//---//---//

### Recommended Folder Structure

//---//---//---// //---//---//---//
//---//---//---// //---//---//---//

//---//---//---// //---//---//---//
//---//---//---// //---//---//---//

//---//---//---// //---//---//---//

## SUGGESTED IMPLEMENTATION EXAMPLES:

## RECOMMENDATION FOR YOUR PROJECT:

//---//---//---// //---//---//---//

# NEXT PROMPT (FOR NOT INTERRUPT THE LOGIC IN THE CHAT):

//---//---//---// //---//---//---//

# NEXT IDEA:

- BEST PRISMA DATABASE SECURITY MEASURES - IN THE VERSION IM USING
- ADD SOFT DELETE IN PRISMA WHERE IS A GOOD IDEA AND IF ITS NEDDED

//---//---//---// //---//---//---//
