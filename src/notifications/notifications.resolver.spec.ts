import { buildNotificationReceivedTrigger } from "./notification-delivery.service";
import { NotificationsResolver } from "./notifications.resolver";

describe("NotificationsResolver", () => {
  it("returns the recipient-specific pubsub iterator for top-level subscription users", () => {
    const iterator = {} as AsyncIterableIterator<unknown>;
    const graphqlPubSub = {
      asyncIterableIterator: jest.fn().mockReturnValue(iterator),
    };

    const resolver = new NotificationsResolver(
      {} as never,
      graphqlPubSub as never,
    );

    expect(resolver.notificationReceived({ user: { id: 3 } })).toBe(iterator);
    expect(graphqlPubSub.asyncIterableIterator).toHaveBeenCalledWith(
      buildNotificationReceivedTrigger(3),
    );
  });

  it("returns the recipient-specific pubsub iterator for websocket extra.user contexts", () => {
    const iterator = {} as AsyncIterableIterator<unknown>;
    const graphqlPubSub = {
      asyncIterableIterator: jest.fn().mockReturnValue(iterator),
    };

    const resolver = new NotificationsResolver(
      {} as never,
      graphqlPubSub as never,
    );

    expect(resolver.notificationReceived({ extra: { user: { id: 3 } } })).toBe(
      iterator,
    );
    expect(graphqlPubSub.asyncIterableIterator).toHaveBeenCalledWith(
      buildNotificationReceivedTrigger(3),
    );
  });
});
