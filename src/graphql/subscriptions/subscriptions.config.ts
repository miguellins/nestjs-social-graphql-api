import { JwtService } from "@nestjs/jwt";
import { Logger } from "@nestjs/common";

import { subscriptionConnectionParamsSchema } from "@/graphql/subscriptions/schemas/subscription-connection-params.schema";
import type { SubscriptionExtra } from "@/graphql/config/graphql-context.types";

import type { UserRole } from "@/users/enums/user-role.enum";

import { randomUUID } from "crypto";

/** Builds the GraphQL websocket transport configuration. */
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
          extra.requestId = resolveRequestId(
            context.connectionParams?.["x-request-id"],
          );
          const token = subscriptionConnectionParamsSchema.parse(
            context.connectionParams ?? {},
          );
          const payload = await jwtService.verifyAsync<{
            sub: number;
            role?: UserRole;
          }>(token);

          // Reject tokens that do not carry the numeric user id expected by subscriptions
          if (typeof payload.sub !== "number") {
            throw new Error("Invalid subscription token payload");
          }

          extra.user = {
            id: payload.sub,
            role: payload.role,
          };

          logger.debug(
            `WS authenticated — userId: ${extra.user.id}, requestId: ${extra.requestId}`,
          );
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

function resolveRequestId(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (isUnknownArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        return entry.trim();
      }
    }
  }

  return randomUUID();
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
