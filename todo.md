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

//---//---//---// //---//---//---//


# TO FIX:
AFTER IMPLEMENTATION OF PHOTOS AND MEDIA PLAN:

## TODO
- Test All Graphql operations manually with differrents users
- Rename runBestEffort to runNonCritical, for more readability
- Check if barrel imports are useful now that the project got bigger


Create a prompt for codex to check these:

- Check if it worth it to create a reusable function to do this: const limit = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );
beyond the constants already declared
- Check if all modules need a feature-private user cache helper
- Check the introspectComments across all the project and all modules, check for consistency, and fix all to be consistent
- Check for related variables like this that should/are worth it to become common constants: const POST_DETAIL_CACHE_TTL_MS = 60_000;
- Check NEW_codex_recomendations, each module block of good/senior practices and check which modules are using the same practices and whiche ones are not, make more consistent so all modules use the same good/senior practices when it fits and are worth it
- Check if Cache TTL in functions like this can become a common constant with defaults values:
```TypeScript
return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const where: Prisma.PostWhereInput | undefined = search
          ? {
              OR: [
                { title: { contains: search } },
                { content: { contains: search } },
              ],
            }
          : undefined;

        return this.prisma.post.findMany({
          take,
          where,
          orderBy: {
            createdAt: toSortDirection(orderby),
          },
          select: SafePostListSelect,
        });
      },
      // HERE
      30_000, // HERE
    );
```
- Check the DTOs and Select to be comment consistent, one JSDOC comment before the type and the const select. Like this:
```TypeScript
/** Extends the list select */
export const SafePostDetailSelect = {}...
```
- Check if this should/are worth it becoming a common or local constant: const MAX_QUERY_LENGTH = 50;
- Check if these variables are used frequently: const MAX_ATTACHMENTS_PER_POST = 4; and const MAX_VIDEOS_PER_POST = 1;
- Check if this arg can become one common arg:
type PaginationParams = {
  take?: number;
  orderBy?: ChronologicalOrder;
};
- Should this be a pattern in ObjectsType?: @ObjectType("SignedMediaViewUrl")
- Check whats the best alternative (keep description field or the instropectComment) to this:
```TypeScript
/** Presentation-friendly UTC timestamp for UI display. */
  @FormattedDateTimeField("createdAt", {
    description:
      "Presentation-friendly UTC timestamp for when the like was created.",
  })
  createdAtFormatted?: string;
```
- Check all resolvers to find if there is any operations that are not marked as @Public() and dont use the @CurrentUser() decorator
- Check all resolvers to see if this logic is correct: When the operation DONT use @CurrentUser() it should have a @Public() decorator









# QUESTIONS ABOUT THE FILE:

 Module


1




2




3




4







# The Problem:

Check every file in the project, search and research about what i dont understand

//---//---//---// //---//---//---//









# ABOUT THE NEW IMPLEMENTATION:










//---//---//---// //---//---//---//



