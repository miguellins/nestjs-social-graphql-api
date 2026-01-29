TODO List
- ADD JWT
- ADD HELMET
- ADD Security

JWT IN GRAPHQL


## When it’s worth it (most cases)

Add rate limiting if any of these are true:

* Your API is reachable from a browser/public internet
* You have **login/signup** mutations
* You’ll deploy beyond localhost
* You want protection against brute-force and abuse

Even in “dev-only” projects, it’s a good habit.

---

## GraphQL-specific gotchas (important)

In REST you rate limit per endpoint (`/login`, `/users`, etc.).
In GraphQL, most traffic hits **one endpoint**: `/graphql`.

So if you add a global limiter like “10 req/min”, you can accidentally rate-limit:

* normal browsing in Playground
* batching
* multiple queries in short bursts

### What works best in GraphQL

✅ **Rate limit per operation** (login, signup, expensive queries)
✅ Use a higher global limit, and a stricter limit only for auth mutations

---

## Recommended approach for NestJS + GraphQL

### 1) Add a mild global rate limit

Example: **100 requests/min per IP**

### 2) Add strict limits to auth operations

Example:

* login: **5/min**
* signup: **3/min**

### 3) Add complexity limits (optional but powerful)

Limit query depth / complexity to prevent “nested query bombs”.

---

## What you should do right now

If your app has auth already:

* ✅ Add strict rate limit to `login` + `signup`
* ✅ Keep global limit reasonable (don’t make dev painful)

---

## Quick example limits (good defaults)

* Global: `100/min`
* Login: `5/min`
* Signup: `3/min`
* Password reset: `3/min`

---

## When you might skip it

You can skip rate limiting only if:

* it’s truly local-only, never exposed
* no auth endpoints
* you don’t care about abuse protection

But as soon as it’s public-facing, add it.

---

If you tell me whether your GraphQL server is public or only local, and whether you already use `@nestjs/throttler`, I can give you the exact NestJS code-first setup with:

* global throttler guard
* per-resolver `@Throttle()` on `login`/`signup`
* optional Redis storage for multi-instance deployments
