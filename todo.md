# AFTER EVERYTHING IS DONE:
- ADD DOCKER
- ADD GIT LAB
- CREATE AN BIG AND WELL EXPLAINING PROMPT TO CODEX CREATE README.MD FILE - ASKS IF GRAPHQL QUERIES SHOULD BE INSIDE THE FILE
- UPDATE THE .GITIGNORE FILE


//---//---//---// //---//---//---//


# NEXT FEATURE
- Search for Database/Prisma (separate in md) best practices and create a prompt to add in the AGENTS.md and check my project
- Search for Error Handling (see if there is difference for pure typescript, for NestJs or for Prisma) best practices, list all of them and add them to AGENTS.md


//---//---//---// //---//---//---//


# TO FIX:
Check if any query was affect by the changes, list all of them and what as affected
Should i create a .env for prod or dev?


 - [`likes.service.ts`] and [`follows.service.ts`] still use `console.error` for best-effort notification failures; switching to Nest `Logger` is reasonable but not required.

- [`qgl-throttler.guard.ts`] skips subscription operations entirely, so subscription throttling is effectively a separate design problem; I left that alone.

- Offset `take` pagination is acceptable at your current small caps, though cursor pagination would scale better for very large feeds per Prisma docs.

- Notification logging style in likes/follows: worth a separate low-risk cleanup, but not required for correctness.

- Subscription throttling design: current guard intentionally skips subscription operations, and a real fix there needs a broader WS-specific decision.




Why dont use the ChronologicalOrder in this orderby?:
/src/posts/posts.service.ts b/src/posts/posts.service.ts
             likes: {
               take: likesTake,
               orderBy: {
                 createdAt: "desc",
               },
               select: SafePostDetailSelect.likes.select,
             },
+            comments: {
+              take: commentsTake,
+              orderBy: {
+                createdAt: "desc",
+              },
+              select: SafePostDetailSelect.comments.select,
+            },




//---//---//---// //---//---//---//


# TEXT TO CONVERT TO PROMPT IN GPT






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