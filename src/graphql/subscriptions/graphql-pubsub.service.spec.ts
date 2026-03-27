import { Logger } from "@nestjs/common";

import type { PubSubRedisOptions } from "graphql-redis-subscriptions";

const redisPubSubMock = {
  publish: jest.fn(),
  asyncIterableIterator: jest.fn(),
  close: jest.fn(),
};

const redisConstructorMock = jest.fn().mockImplementation((_url, _options) => ({
  on: jest.fn(),
}));

const redisPubSubConstructorMock = jest.fn().mockImplementation(() => ({
  publish: redisPubSubMock.publish,
  asyncIterableIterator: redisPubSubMock.asyncIterableIterator,
  close: redisPubSubMock.close,
}));

jest.mock("ioredis", () => ({
  __esModule: true,
  default: redisConstructorMock,
}));

jest.mock("graphql-redis-subscriptions", () => ({
  RedisPubSub: redisPubSubConstructorMock,
}));

import { GraphqlPubSubService } from "@/graphql/subscriptions/graphql-pubsub.service";

describe("GraphqlPubSubService", () => {
  const configServiceMock = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    configServiceMock.get.mockImplementation((key: string) => {
      switch (key) {
        case "GRAPHQL_SUBSCRIPTIONS_REDIS_URL":
          return undefined;
        case "REDIS_URL":
          return "redis://localhost:6379";
        case "GRAPHQL_SUBSCRIPTIONS_REDIS_NAMESPACE":
          return "graphql-subscriptions";
        default:
          return undefined;
      }
    });
  });

  it("builds Redis publisher and subscriber clients using the configured Redis URL", () => {
    new GraphqlPubSubService(configServiceMock as never);

    expect(redisConstructorMock).toHaveBeenCalledTimes(2);
    expect(redisConstructorMock).toHaveBeenNthCalledWith(
      1,
      "redis://localhost:6379",
      {
        maxRetriesPerRequest: null,
      },
    );
    expect(redisConstructorMock).toHaveBeenNthCalledWith(
      2,
      "redis://localhost:6379",
      {
        maxRetriesPerRequest: null,
      },
    );
  });

  it("prefixes triggers with the configured namespace", () => {
    new GraphqlPubSubService(configServiceMock as never);

    const calls = redisPubSubConstructorMock.mock.calls as [
      PubSubRedisOptions,
    ][];
    const options = calls[0]?.[0];

    expect(options).toBeDefined();
    expect(options?.triggerTransform("notificationReceived")).toBe(
      "graphql-subscriptions:notificationReceived",
    );
  });

  it("delegates publish and async iterator calls to the Redis pubsub engine", async () => {
    const iterator = {} as AsyncIterableIterator<unknown>;

    redisPubSubMock.publish.mockResolvedValue(undefined);
    redisPubSubMock.asyncIterableIterator.mockReturnValue(iterator);

    const service = new GraphqlPubSubService(configServiceMock as never);

    await service.publish("notificationReceived", {
      notificationReceived: {
        id: 1,
      },
    });

    expect(redisPubSubMock.publish).toHaveBeenCalledWith(
      "notificationReceived",
      {
        notificationReceived: {
          id: 1,
        },
      },
    );

    expect(service.asyncIterableIterator("notificationReceived")).toBe(
      iterator,
    );
    expect(redisPubSubMock.asyncIterableIterator).toHaveBeenCalledWith(
      "notificationReceived",
    );
  });

  it("closes the Redis pubsub engine on module shutdown", async () => {
    redisPubSubMock.close.mockResolvedValue(["OK", "OK"]);

    const service = new GraphqlPubSubService(configServiceMock as never);

    await service.onModuleDestroy();

    expect(redisPubSubMock.close).toHaveBeenCalled();
  });

  it("logs shutdown failures instead of throwing", async () => {
    redisPubSubMock.close.mockRejectedValue(new Error("close failed"));

    const loggerSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);

    const service = new GraphqlPubSubService(configServiceMock as never);

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();

    expect(loggerSpy).toHaveBeenCalledWith(
      "Failed to close Redis pubsub clients cleanly",
      expect.any(String),
    );
  });
});
