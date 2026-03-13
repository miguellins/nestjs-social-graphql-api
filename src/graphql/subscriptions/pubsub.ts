import { PubSub } from "graphql-subscriptions";

/**
 * Shared in-memory PubSub instance for GraphQL subscriptions
 * Use this to publish domain events from services and to consume them in
 * subscription resolvers, so both sides talk through the same event bus.
 */

export const pubSub = new PubSub();
