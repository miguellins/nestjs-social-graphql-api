import type { Request, Response } from "express";

/** Extra data attached to a GraphQL WebSocket subscription connection (lives on `context.extra` for subscription operations and stores connection-scoped metadata such as the authenticated user resolved during the WebSocket handshake) */
export type SubscriptionExtra = {
  // Authenticated user attached during the WebSocket connection handshake
  user?: {
    // Unique identifier of the authenticated user
    id: number;
  };

  // Allows attaching other connection-scoped metadata later if needed
  [key: string]: unknown;
};

/** GraphQL context object available to resolvers, unifies HTTP (req/res) and WebSocket (extra) transports. */
export type GqlContext = {
  // Incoming HTTP request object. Present in query/mutation context
  req?: Request;

  // Outgoing HTTP response object. Present in query/mutation context
  res?: Response;

  // Additional context injected by the WebSocket server (e.g. graphql-ws)
  // Used to carry authenticated user data in subscription connections
  extra?: SubscriptionExtra;
};
