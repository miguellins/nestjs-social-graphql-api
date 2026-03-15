import { JwtService } from "@nestjs/jwt";
import { Logger } from "@nestjs/common";

import { subscriptionConnectionParamsSchema } from "@/graphql/subscriptions/schemas/subscription-connection-params.schema";
import type { SubscriptionExtra } from "@/graphql/config/graphql-context.types";

/**
 * Configures GraphQL websocket subscriptions and connection authentication
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
        logger.debug(
          `WS connection attempt — params: ${JSON.stringify(context.connectionParams)}`,
        );

        const extra = context.extra as SubscriptionExtra;
        const token = subscriptionConnectionParamsSchema.parse(
          context.connectionParams ?? {},
        );

        try {
          const payload = await jwtService.verifyAsync<{ sub: number }>(token);

          extra.user = {
            id: payload.sub,
          };

          logger.debug(`WS authenticated — userId: ${extra.user.id}`);
        } catch {
          throw new Error("Invalid or expired websocket token");
        }
      },
    },
  };
}
