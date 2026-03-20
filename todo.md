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


//---//---//---// //---//---//---//


# TO FIX:

CREATE A PROMPT TO IMPROVE THE CODEX ANSWERS TO FIX THIS:

ADD TO AGENTS.md RULES:
NEVER ADD THESE PATHS IN THE RETURN OF PROMPTS:
[posts.service.ts](/home/mlins/Desktop/nestjs_graphql/src/posts/posts.service.ts)

Since you already return [posts.service.ts]




//---//---//---// //---//---//---//


# TEXT TO CONVERT TO PROMPT IN GPT







**Shared Helper**
Repeated local logic was real, so I extracted [run-best-effort.ts]. It centralizes the narrow case the global filter cannot help with: post-success follow-up work that should be logged but must not flip a committed operation into an error.






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