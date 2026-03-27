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

Missing for a realistic MVP:
- User avatar/profile photo.
- Bio and profile metadata.
- Real pagination.
- Basic report/block.
- Email verification.
- Session revocation.
- Notification preferences.


//---//---//---// //---//---//---//


# TO FIX:

AFTER IMPLEMENTATION OF PHOTOS AND MEDIA PLAN:
- Check if everything is correct
- Reset and delete all migrations and migrate dev the new schema for start (Database with zero data)
- Return All GraphQL operations affected
- Test All Graphql operations manually with differrents users









# QUESTIONS ABOUT THE NEW FEATURE:









# The Problem:

Improvements in Models (Tables)




//---//---//---// //---//---//---//


# Post:

TO FIX:

## Post Search is simplistic
It means your current post search is just a basic database text filter, not a real search system.

In this project, `posts.service.ts` does this:
- trims/lowercases `q`
- runs Prisma `findMany`
- uses `contains` on `title` and `content`

That is simple substring matching.

Why that is “simplistic”:
- no relevance ranking
  - results are not ordered by best match, only by `createdAt`
- no stemming / morphology
  - searching `run` may not match `running` the way users expect
- no typo tolerance
  - `javascript` will not behave like `javascript`
- no tokenization intelligence
  - phrases, word boundaries, and language behavior are limited
- weak scalability for larger datasets
  - `%contains%` style matching becomes less attractive as data grows
- limited indexing benefit
  - normal indexes do not help much for arbitrary substring search

What “fulltext strategy” means:
- using database-native full-text search features
- for MySQL, typically FULLTEXT indexes plus `MATCH ... AGAINST`
- gives better relevance and better performance than naive `contains`

Check if this is worth it and "real world social media" and check whats the best option. Focusing in production ready and real world alike projects
What “external search” means:
- using a dedicated search engine/service such as:
  - Elasticsearch / OpenSearch
  - Meilisearch
  - Algolia
  - Typesense
- useful when you need:
  - relevance ranking
  - typo tolerance
  - filters + facets
  - autocomplete
  - scalable search UX

So the statement means:
- your current search is fine for a small MVP
- but if search becomes an important product feature, this implementation is not enough long-term

In short:
- current search = simple text filtering
- fulltext search = better database-backed search
- external search = full-featured production search system


## Post is too minimal for a realistic product

It means the current `Post` entity is too minimal for a realistic product.

Right now a post is basically:
- `title`
- `content`

That is enough for CRUD practice, but not enough for a more realistic social/content model.

Why it is considered weak:
- many social posts do not naturally need a title
- all posts being forced into `title + content` is artificial UX
- it limits content types and product evolution
- it does not model common post metadata

A “better post model” usually means adding or rethinking fields such as:
- optional title instead of required title
- body/content designed for short-form vs long-form use
- image/media support
- post type
  - text
  - image
  - link
  - repost
- visibility/privacy
- edited state
- tags/categories
- slug/permalink behavior if needed
- publish/draft/scheduled state

So the phrase means:
- the current schema works technically
- but it is still an MVP/training-level content model
- a more realistic app would likely move beyond “every post must have a title and content”



//---//---//---// //---//---//---//









# ABOUT THE NEW IMPLEMENTATION:



## IMPROVE ALL MODELS













//---//---//---// //---//---//---//
