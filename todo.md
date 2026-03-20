# TO REVIEW CHANGES:
via the Source Control panel
click the branch name in the bottom-left status bar
then use the "Compare with..." option to pick master


# AFTER EVERYTHING IS DONE:
- ADD DOCKER
- ADD GIT LAB
- CREATE AN BIG AND WELL EXPLAINING PROMPT TO CODEX CREATE README.MD FILE - ASKS IF GRAPHQL QUERIES SHOULD BE INSIDE THE FILE
- UPDATE THE .GITIGNORE FILE


//---//---//---// //---//---//---//


# NEXT FEATURE
- Replace in-memory pubsub with Redis-backed or broker-backed realtime.

- No password reset.


- implement cursor pagination

- use denormalized post counters consistently

- stop synchronously incrementing views on hot reads



//---//---//---// //---//---//---//


# TO FIX:






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