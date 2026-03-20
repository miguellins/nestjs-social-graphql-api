import { JwtService } from "@nestjs/jwt";
import { Logger } from "@nestjs/common";

import { subscriptionConnectionParamsSchema } from "@/graphql/subscriptions/schemas/subscription-connection-params.schema";
import type { SubscriptionExtra } from "@/graphql/config/graphql-context.types";

/**
 * GraphQL subscriptions configuration
 *
 * Authenticates and builds the subscription context
 */

// Builds the GraphQL websocket transport configuration
export function createGraphqlSubscriptionsConfig(jwtService: JwtService) {
  const logger = new Logger("GraphQLModule");

  return {
    "graphql-ws": {
      // Give clients more time to send connection_init before the server closes the socket
      connectionInitWaitTimeout: 60_000,

      // Send WebSocket ping frames periodically to keep idle connections alive
      keepAlive: 20_000,

      onConnect: async (context: {
        connectionParams?: Record<string, unknown> | null;
        extra: unknown;
      }) => {
        logger.debug("WS connection attempt");

        try {
          const extra = context.extra as SubscriptionExtra;
          const token = subscriptionConnectionParamsSchema.parse(
            context.connectionParams ?? {},
          );
          const payload = await jwtService.verifyAsync<{ sub: number }>(token);

          // Reject tokens that do not carry the numeric user id expected by subscriptions
          if (typeof payload.sub !== "number") {
            throw new Error("Invalid subscription token payload");
          }

          extra.user = {
            id: payload.sub,
          };

          logger.debug(`WS authenticated — userId: ${extra.user.id}`);
        } catch (error) {
          // Keep handshake failures explicit for clients without leaking verification details
          const reason = error instanceof Error ? `: ${error.name}` : "";

          logger.warn(`WS authentication failed${reason}`);
          throw new Error("Unauthorized");
        }
      },
    },
  };
}
