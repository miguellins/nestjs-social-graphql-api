# AFTER EVERYTHING IS DONE:

- ADD DOCKER
- ADD GIT LAB
- READ PRISMA DOCUMENTATION AND ADD ERROR HANDLING FOR THIS SERVICE: (service) ALSO CHANGE SPEC FILE IF NEEDDED
- CHECK FILES AND THEIR COMMENTS, A LOT OF FILES WAS CHANGED, SO COMMENTS MUST BE CHANGED TOO
- CREATE AN BIG AND WELL EXPLAINING PROMPT TO CODEX CREATE README.MD FILE - ASKS IF GRAPHQL QUERIES SHOULD BE INSIDE THE FILE

//---//---//---//
//---//---//---//

# PROMPT FOR CODEX:

ABOUT INTERFACE TYPES:
Check if there is any objecttype that are suitable for interfacetype:
This is most useful when:
you have many object types with repeated fields
you want schema consistency
you want shared API contracts for clients
you may later expose generic “node-like” or activity-like results
It can make your schema cleaner and easier to reason about.

---

SHOULD I CREATE A INTERFACE TYPE LIKES THIS:
NODE
@InterfaceType()
abstract class Node {
@Field(() => Int)
id: number;
}

USEFUL FOR:

- USER
- POST
- COMMENT
- NOTIFICATION
  AND OTHERS...

---

TIMESTAMPED
@InterfaceType()
abstract class Timestamped {
@Field(() => GraphQLISODateTime)
createdAt: Date;

@Field(() => GraphQLISODateTime)
updatedAt: Date;
}

USEFUL FOR:

- POST
- COMMENT
- NOTIFICATION
- MAYBE LIKE, FOLLOW IF THEY EXPOSE TIMESTAMPS THERE

## RECOMMENDATION FOR YOUR PROJECT:

My recommendation for your project
Do now
Use or expand enums.
That is the highest-value, lowest-complexity improvement.

Do next
Add one small interface, probably for shared base fields:

Node
or
Timestamped

Do later
Use unions when you actually add a mixed-result feature like:

- global search
- feed
- polymorphic notification targets

//---//---//---//

# NEXT PROMPT (FOR NOT INTERRUPT THE LOGIC IN THE CHAT):

Possible improvement:
if you want richer schema docs, you could add description and valuesMap for enum values in the registerEnumType call
that is a nice enhancement, not a missing architectural piece

---

HOW/IF I CAN IMPROVE THIS:
What I see in your project:
repeated preview/user-like shapes:
SafeUser
SafeUserPreview
NotificationActorDTO

---

Recommendation
For your project right now:
Enums: yes, suitable, and already correctly used with NotificationType.

//---//---//---//

# NEXT IDEA:

Suitable future enum spots:

# 1

Post sorting
find-posts.args.ts

Why:
if you later support choices like NEWEST, OLDEST, MOST_LIKED, MOST_COMMENTED
that should be an enum, not a free string

# 2

Notification filtering
notifications.resolver.ts

Why:
if you add filters like ALL, UNREAD, READ
or filtering by notification category via NotificationType
enums fit naturally here

# 3

Feed/list ordering in follows/likes/comments
Relevant args/resolvers:
find-likes.args.ts
find-comments-by-post.args.ts
follows.resolver.ts

Why:
if you introduce explicit order modes such as NEWEST_FIRST, OLDEST_FIRST
enum is better than raw string args

# 4

Mutation mode / action selectors, if introduced
Examples where this could become useful:
notifications bulk actions
admin moderation actions

Why:
if a mutation starts accepting a limited set of command-like values, that should be an enum

---

//---//---//---//

//---//---//---//
//---//---//---//

CHAT GPT FULL RECOMENDATIONS:

//---//---//---//
//---//---//---//

CODEX ABOUT THE PROJECT LEVEL:
