# GraphQL Subscriptions Module

The GraphQL subscriptions module owns Redis-backed GraphQL subscription pubsub and authenticated websocket connection setup.

## What this module covers

- Redis-backed pubsub publisher/subscriber clients
- namespaced subscription triggers
- GraphQL websocket authentication
- subscription request id initialization
- pubsub readiness checks

## Important behavior

- subscriptions use `graphql-ws`
- websocket connections authenticate through JWT connection params
- unauthorized subscription connections fail with a generic error
- subscription triggers are namespaced with `GRAPHQL_SUBSCRIPTIONS_REDIS_NAMESPACE`
- published payloads must match the subscription field shape expected by resolvers
- Redis-backed pubsub is used instead of in-memory pubsub for multi-instance readiness

## Configuration

- `GRAPHQL_SUBSCRIPTIONS_REDIS_URL`
- `REDIS_URL`
- `GRAPHQL_SUBSCRIPTIONS_REDIS_NAMESPACE`

## Service ownership

- `GraphqlPubSubService` owns Redis pubsub clients, trigger namespacing, publishing, async iterators, ping checks, and shutdown cleanup.
- `createGraphqlSubscriptionsConfig` owns websocket connection authentication and connection context setup.
