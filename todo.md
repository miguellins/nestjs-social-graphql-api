AFTER:

- CREATE AN BIG AND WELL EXPLAINING PROMPT TO CODEX CREATE README.MD FILE

##TODO NEXT
ASK CODEX TO CHECK THE CACHING IN EVERY FILE. CHECK IF ITS CORRECT NOW THAT:
await this.cacheHelper.del(`user:safe:${existing.authorId}`);
await this.cacheHelper.bumpVersion("v:user:list");
was removed for several services

So should you keep or remove them?
Keep them if your user cache includes:

post count

like count

comment count

recent posts

user activity stats

any data derived from posts/likes/comments

Remove them if your user cache includes only:

id

name

username

basic static profile fields

//---//---//---//

ADD:
Optional future improvement

This is not required for the migration, but later you may want to add:

POST_COMMENTED

to NotificationType, since comments often trigger notifications.

//---//---//---//

5. **Bookmarks/Saves**

- Private saved posts collection (`savePost`, `unsavePost`, `mySavedPosts`).

11. **Search**

- Dedicated search for users/posts/tags with ranking and pagination.

now, i want to add comments in posts, the number of posts comments and the number of posts views (how many times a specific post was searched by postById)
