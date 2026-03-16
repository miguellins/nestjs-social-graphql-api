import { PubSub } from "graphql-subscriptions";

/**
 * PubSub instance for GraphQL subscriptions
 *
 * Provides the event bus used by subscription handlers
 */

export const pubSub = new PubSub();
