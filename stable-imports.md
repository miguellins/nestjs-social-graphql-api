NEXT FEATURE AFTER ZOD

Stable imports help with:

- easier refactoring
- cleaner architecture
- less broken imports
- better module boundaries
- easier reuse

# PROMPT:

Check my entire project and improve import stability where it is actually useful.

Project context:

- This is a real application codebase, not a demo
- I want better long-term maintainability
- I want more stable, cleaner import paths where appropriate
- Do not make unnecessary changes just for style
- Prefer practical improvements with low risk

Main goal:
Inspect the whole project and identify where imports are unstable, overly deep, inconsistent, fragile, or too coupled to internal file structure. Then improve them only when it adds real value.

What I want you to inspect:

- the full project structure
- all module boundaries
- all current import paths
- barrel files (`index.ts`)
- path aliases
- deeply nested imports
- feature/module public APIs
- shared/common folders
- circular dependency risk
- duplicate or inconsistent import patterns across the codebase

What I mean by “stable imports”:

- imports should come from predictable, durable, public module entry points when appropriate
- avoid fragile deep imports into internal implementation files unless there is a good reason
- prefer imports that are less likely to break during refactors
- keep module boundaries clear
- do not overuse barrels if they introduce circular dependencies or make the architecture worse

Important rules:

- Do not blindly create `index.ts` files everywhere
- Do not change imports if the current version is already the cleanest choice
- Do not introduce circular dependencies
- Do not make the import graph harder to understand
- Prefer small, high-confidence refactors
- Keep the current architecture in mind
- If a direct file import is better than a barrel import in a specific case, keep it
- Only add stable imports when they improve maintainability, consistency, or module boundaries

What I want you to do:

1. Analyze the current import structure across the entire project
2. Identify unstable or overly deep imports
3. Identify places where public module entry points would be better
4. Identify places where barrel files should NOT be used
5. Refactor imports only where it clearly improves the codebase
6. Keep changes minimal, safe, and production-friendly

Pay special attention to:

- `common/`
- `shared/`
- module folders like `auth/`, `users/`, `posts/`, `comments/`, `notifications/`, etc.
- repeated imports from deep internal paths
- opportunities to expose clean module-level public exports
- inconsistencies in how the same module is imported from different places
- places where stable imports would reduce future breakage during refactors

Return the answer in this format:

1. Current import architecture

- summarize how imports are currently organized
- identify strengths
- identify weaknesses
- identify any inconsistency patterns

2. Good candidates for stable imports
   For each candidate, show:

- file/folder/module
- current import pattern
- recommended stable import pattern
- why it is better
- whether the change should be made now or later

3. Places where stable imports are NOT worth it

- explain why direct imports should stay
- identify places where barrels or public exports would be harmful

4. Recommended structure

- suggest the best overall approach for this codebase
- explain where module-level `index.ts` files make sense
- explain where they should be avoided
- mention any path alias improvements if relevant

5. Exact implementation

- apply the improvements directly in the project
- show the files changed
- keep the changes minimal and safe
- avoid unnecessary churn

6. Final recommendation

- summarize what was changed
- explain why these import changes improve stability
- mention any follow-up cleanup worth doing later

Important:

- Base the answer on my actual codebase, not generic advice
- Prefer maintainability over aesthetic-only changes
- Be conservative and architecture-aware
- Improve import stability only where it truly helps
