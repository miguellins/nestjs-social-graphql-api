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

# PROMPT:

Check all .dto and .model files with JSDoc file and edit the comment to be more simple and direct

//---//---//---// //---//---//---//
//---//---//---// //---//---//---//

## Prompt for Clean Up

//---//---//---// //---//---//---//
//---//---//---// //---//---//---//

# About Zod:

CREATE A PROMPT TO EXPLAIN WHAT ZOD DO IN THE PROJECT:

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
