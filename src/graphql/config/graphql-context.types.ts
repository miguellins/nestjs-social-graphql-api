import type { Request, Response } from "express";

/**
 * GraphQL context type definitions
 *
 * Describes the request and subscription context shape
 */

/**
 * Extra data attached to a GraphQL WebSocket subscription connection
 *
 * This object lives on `context.extra` for subscription operations and stores
 * connection-scoped metadata, such as the authenticated user resolved during
 * the WebSocket handshake
 */

export type SubscriptionExtra = {
  // Authenticated user attached during the WebSocket connection handshake
  user?: {
    // Unique identifier of the authenticated user
    id: number;
  };

  // Allows attaching other connection-scoped metadata later if needed
  [key: string]: unknown;
};

/**
 * GraphQL execution context passed to resolvers and middleware
 *
 * Supports both HTTP (`req`/`res`) and WebSocket (`extra`) transports,
 * enabling a unified context shape across queries, mutations, and subscriptions
 */

export type GqlContext = {
  // Incoming HTTP request object. Present in query/mutation context
  req?: Request;

  // Outgoing HTTP response object. Present in query/mutation context
  res?: Response;

  // Additional context injected by the WebSocket server (e.g. graphql-ws)
  // Used to carry authenticated user data in subscription connections
  extra?: SubscriptionExtra;
};
