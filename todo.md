AFTER EVERYTHING IS DONE:

- ADD DOCKER
- ADD GIT LAB
- CREATE AN BIG AND WELL EXPLAINING PROMPT TO CODEX CREATE README.MD FILE - ASKS IF GRAPHQL QUERIES SHOULD BE INSIDE THE FILE
- ADD GOOD AND STRONG ERROR HANDLING IN EACH SERVICE

//---//---//---//
//---//---//---//

PROMPT FOR CODEX:

//---//---//---//

NEXT PROMPT TO CHATGPT (TO NOT MISS THE CURRENT LOGIC):
isnt this the exact function of the @Trim() transformer? whats the difference?: For your specific DTO, the best middleware candidates are title and body because they are user-facing text fields. That makes them a natural place for things like trimming output, collapsing repeated whitespace, truncating previews, or masking sensitive fragments before the response goes back to the client. Those are exactly the kinds of “convert the result of a field” use cases Nest describes for field middleware.

//---//---//---//

TODO NEXT:

ABOUT FIELD MIDDLEWARE:

Best fit
NotificationDTO.body
notification.model.ts

Why suitable:
field middleware is good for lightweight output transformation
if you later want truncation, sanitization, or conditional masking of notification text, this is a clean field-level hook

PostDetail.viewsCount
post-detail.model.ts

Why suitable:
if you want lightweight formatting or visibility rules around this metric, field middleware fits better than resolver-level branching
example: hiding analytics-style fields from some roles in the future
NotificationDTO.actor
notification.model.ts

Why suitable:
if you ever need field-level shaping of nested actor data for privacy or presentation, middleware can do that without changing the whole notification resolver flow
Possible but lower-value

Date fields for presentation normalization
Examples:
safe-user.model.ts
posts.model.ts
post-detail.model.ts

Why:
middleware can transform values before they go out
but in your project, date handling is already straightforward and standard, so this is optional

//---//---//---//

Create it under a shared GraphQL area, not inside a feature service.

Best location in your project:

- `src/graphql/middleware/`
- or `src/common/graphql/middleware/` if you want it alongside guards/filters/decorators

Given your current structure, I would use:

- `src/graphql/middleware/notification-body.middleware.ts`
- `src/graphql/middleware/actor-visibility.middleware.ts`

Why there:

- field middleware is GraphQL-specific infrastructure
- it should stay separate from business services
- it is easier to reuse and reason about when grouped by GraphQL concern

Where it would be attached:

- directly on `@Field(...)` inside the relevant `@ObjectType()` class
- for example, if you ever used it, the attachment point would be in:
  - [`src/notifications/models/notification.model.ts`](/home/mlins/Desktop/nestjs_graphql/src/notifications/models/notification.model.ts)
  - possibly [`src/posts/models/post-detail.model.ts`](/home/mlins/Desktop/nestjs_graphql/src/posts/models/post-detail.model.ts)

Would this change behavior?

- yes, potentially
- field middleware exists specifically to alter or gate field resolution behavior

It can change behavior by:

- transforming returned values
- hiding/masking fields
- throwing on field access
- adding conditional logic per field

If you write a no-op middleware, behavior stays the same. But a real middleware is behavior-changing by design.

So:

- create it under `src/graphql/middleware/`
- attach it at the field decorator level in the relevant `ObjectType`
- assume it changes behavior unless it is intentionally observational only

//---//---//---//
//---//---//---//

CHAT GPT FULL RECOMENDATIONS:

5. Field middleware

Nest GraphQL field middleware lets you run logic before or after a field resolves. The docs call out use cases like transforming field values, validating field arguments, and field-level role checks. This could be useful in your project for masking sensitive fields, formatting output, or lightweight field-level access rules. One limitation: the docs note field middleware applies only to ObjectType classes.

6. Extensions metadata

Nest’s @Extensions() lets you attach metadata to fields, such as required roles, and then read that metadata at runtime for generic authorization behavior. That would fit well if you want field-level authorization for things like email, internal notification fields, or admin-only properties without spreading custom checks everywhere.

7. Interfaces, unions, and enums

Nest’s code-first GraphQL docs support abstract interfaces with @InterfaceType(), plus unions and enums. This is useful when your schema starts getting richer. In your app, interfaces would be a clean way to standardize shared fields like id, createdAt, and updatedAt; unions would be useful for a future mixed search result like User | Post | Comment; and enums are a good fit for things like notification types and sort options.

8. Directives

Nest supports GraphQL directives in code-first as well. This is not the first thing I’d add, but it becomes useful for deprecations and schema-driven behaviors as your API evolves. If you start replacing old fields or operations, directives give you a cleaner migration path.

10. Subscriptions, but in a more production-ready way

You already have graphql-ws and graphql-subscriptions in your dependencies, and Nest’s docs strongly recommend graphql-ws over the older transport approach. Since you’re already exploring notifications, this is a natural area to improve further: authenticated subscriptions, filtered subscriptions, and wiring notification delivery cleanly to your domain events.

//---//---//---//
//---//---//---//

CODEX ABOUT THE PROJECT LEVEL:
