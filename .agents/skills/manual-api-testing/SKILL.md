---
name: manual-api-testing
description: |
  Create concise manual API tests with a data-first flow.
  Ask once for all fixtures needed by all planned tests.
  Then return one execution-ready GraphQL test at a time using the user's real data.
---

# Manual API Testing

## Goal
Generate concise manual API tests for a feature/change set. Cover only meaningful cases: happy path, validation, auth/ownership, read impact, side effects, bug risks, and regressions.

## Core rules
- Before Test 1, plan the useful tests and request **all data needed for all tests**.
- If any required data is missing, return only `## Needed data for all Tests` and wait.
- After the user sends data, return the test list if requested, then **Test 1** with real ids/usernames already inserted.
- Return one full test at a time. Continue only after the current test is validated.
- Reuse provided fixtures; do not create users/posts inside tests unless unavoidable.
- Keep each step to one GraphQL operation. No tables. Keep output short.

## Needed data preflight
Ask for exact fixture counts and specs needed by the whole planned test set. Do not ask for generic placeholders.

Use this format:

```md
## Needed data for all Tests

To run these tests with less setup inside the test output, prepare:

- Users: {count}
  - `{label}`: id, username
    - {role/privacy/ownership/follow-state requirement if needed}

- Posts: {count if needed}
  - `{label}`: id, author id/username, title/content if needed
    - {ownership/visibility/status requirement if needed}

- Counts: {only if needed}
  - current `{entity.field}`

- Other data: {only if needed}
  - `{label}`: {ids/status/relationship specs}

Accept clear text, bullets, or JSON. Parse grouped sections such as users, posts, counts, roles, ownership, privacy, and relationships. Do not print an example input format.
```

If the data is understandable, use it. Ask follow-up only for missing required values.

## Input accepted
Feature descriptions, affected operations, specific test goals, ids, usernames, roles, ownership, visibility/privacy, counters, setup facts, and previous results. Treat user data as authoritative unless results contradict it.

## Defaults
- GraphQL requests use HTTP POST to `/graphql`.
- Do not ask for tokens; assume they are already saved in the API client.
- When auth matters, write only `(use Authorization)` in the login line.
- Do not ask for base URL unless custom setup or request failure requires it.

## Coverage checklist
Choose only relevant tests:
- happy path
- validation errors
- unauthenticated access
- role/ownership restrictions
- duplicate/idempotency behavior
- missing-resource behavior
- read impact: detail, list, nested fields, ordering, pagination
- side effects: counters, notifications, jobs/events, derived fields
- regressions on behavior that should still work

## Test list behavior
- If the user asks for tests for a feature and data is missing, return only the needed-data checklist.
- After data is provided, return the numbered test list and then Test 1.
- If the user asks for one specific test, request only data needed for that test, then return that test.

## Progress title rule
Every test title must use:
`Test {n}/{total} ({percent}%) - {test title}`

Calculate percent as `n / total * 100`, rounded to nearest whole number. Do not write `finished`.

## Full test format
````md
## Test {n}/{total} ({percent}%) - {test title}
{short explanation}

### Why this test exists
- {behavior or bug risk}
- {indirect impact if relevant}

### Working context (use your existing fixtures)
- `{LABEL_ID}` = `{id}` (`{username}`)

This test uses:
- **{role}**: `{username}` (id `{id}`)

### Step 1. {step title}
{short context if needed}

You should be logged in as:
- `{username}` (use Authorization)

#### Query
```graphql
{operation}
```

#### Variables
```json
{real variables from provided data}
```

#### Expected result
- {short expected result}
- {short expected result}

### Step 2. {step title if needed}
...

Paste the `data` and `errors` for each step, and tell me any ids or values you saved.
````

Rules:
- Always include title, Why this test exists, step titles, Query, Variables, Expected result.
- Include Working context only when fixtures matter.
- Include login line only when auth matters.
- If no variables are needed, use `{}`.
- Do not preview future test details inside the current test.

## Pass/fail rules
PASS only when expected data/errors match, no unexpected GraphQL errors appear, required ids/values were obtained, and indirect effects match.

When a test passes, return only:
```md
Test {n} - PASSED.
```

Do not repeat title, percent, ids, explanation, or result summary after a pass.

FAIL when success returns `null`, unexpected errors appear, auth/ownership is wrong, or counters, notifications, visibility, ordering, nested data, or read models are wrong.

On failure: give a brief diagnosis, likely cause, what to verify, and do not provide the next test yet.
