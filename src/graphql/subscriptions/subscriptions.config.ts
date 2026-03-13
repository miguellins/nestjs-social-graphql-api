import { JwtService } from "@nestjs/jwt";
import { Logger } from "@nestjs/common";

import type { SubscriptionExtra } from "@/graphql/config/graphql-context.types";

/**
 * Creates the GraphQL subscription transport configuration
 *
 * Handles websocket connection timeouts, keepalive behavior, and authentication
 * of subscription clients before they can receive realtime events.
 */

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

        const auth =
          context.connectionParams?.authorization ??
          context.connectionParams?.Authorization;

        if (!auth) {
          throw new Error(
            "Missing authorization in websocket connection params",
          );
        }

        if (typeof auth !== "string" || !auth.startsWith("Bearer ")) {
          throw new Error("Authorization must be in format: Bearer <token>");
        }

        const token = auth.slice(7);

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
