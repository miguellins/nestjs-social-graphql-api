import type { Request, Response } from "express";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

/** HTTP request extended with correlation metadata used across GraphQL execution. */
export type RequestWithContext = Request & {
  requestId?: string;
  user?: AuthenticatedUser;
  body?: {
    operationName?: unknown;
  };
};

/** Extra data attached to a GraphQL WebSocket subscription connection (lives on `context.extra` for subscription operations and stores connection-scoped metadata such as the authenticated user resolved during the WebSocket handshake) */
export type SubscriptionExtra = {
  // Authenticated user attached during the WebSocket connection handshake
  user?: AuthenticatedUser;

  // Correlation id attached during websocket connection setup
  requestId?: string;

  // Operation name when it is available from the GraphQL transport
  operationName?: string;

  // Allows attaching other connection-scoped metadata later if needed
  [key: string]: unknown;
};

/** GraphQL context object available to resolvers, unifies HTTP (req/res) and WebSocket (extra) transports. */
export type GqlContext = {
  // Incoming HTTP request object. Present in query/mutation context
  req?: RequestWithContext;

  // Outgoing HTTP response object. Present in query/mutation context
  res?: Response;

  // Additional context injected by the WebSocket server (e.g. graphql-ws)
  // Used to carry authenticated user data in subscription connections
  extra?: SubscriptionExtra;

  // Correlation id shared by HTTP and subscription GraphQL flows
  requestId?: string;

  // GraphQL operation name when the client provides one
  operationName?: string;
};
