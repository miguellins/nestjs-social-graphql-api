import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { RedisPubSub } from "graphql-redis-subscriptions";

import { deserialize, serialize } from "v8";

import Redis from "ioredis";

type PubSubPayload = Record<string, unknown>;

@Injectable()
export class GraphqlPubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(GraphqlPubSubService.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly pubSub: RedisPubSub;

  constructor(private readonly configService: ConfigService) {
    const redisUrl =
      this.configService.get<string>("GRAPHQL_SUBSCRIPTIONS_REDIS_URL") ??
      this.configService.get<string>("REDIS_URL");

    if (!redisUrl) {
      throw new Error(
        "GRAPHQL_SUBSCRIPTIONS_REDIS_URL or REDIS_URL must be defined",
      );
    }

    const namespace =
      this.configService.get<string>("GRAPHQL_SUBSCRIPTIONS_REDIS_NAMESPACE") ??
      "graphql-subscriptions";

    this.publisher = this.createRedisClient(redisUrl, "publisher");
    this.subscriber = this.createRedisClient(redisUrl, "subscriber");

    this.pubSub = new RedisPubSub({
      publisher: this.publisher,
      subscriber: this.subscriber,
      triggerTransform: (trigger) => {
        const normalizedTrigger = Array.isArray(trigger)
          ? trigger.join(".")
          : String(trigger);

        return `${namespace}:${normalizedTrigger}`;
      },
      serializer: (payload) => serialize(payload).toString("base64"),
      deserializer: (payload) =>
        deserialize(
          Buffer.from(
            typeof payload === "string" ? payload : payload.toString("utf8"),
            "base64",
          ),
        ) as PubSubPayload,
      connectionListener: (error) => {
        this.logger.error(
          "Redis pubsub connection error",
          error instanceof Error ? error.stack : undefined,
        );
      },
    });
  }

  async publish<T extends PubSubPayload>(
    trigger: string,
    payload: T,
  ): Promise<void> {
    await this.pubSub.publish(trigger, payload);
  }

  asyncIterableIterator<T>(
    triggers: string | string[],
  ): AsyncIterableIterator<T> {
    return this.pubSub.asyncIterableIterator<T>(
      triggers,
    ) as AsyncIterableIterator<T>;
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.pubSub.close();
    } catch (error) {
      this.logger.error(
        "Failed to close Redis pubsub clients cleanly",
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private createRedisClient(redisUrl: string, role: string): Redis {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });

    client.on("error", (error) => {
      this.logger.error(
        `Redis ${role} client error`,
        error instanceof Error ? error.stack : undefined,
      );
    });

    return client;
  }
}
