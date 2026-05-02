import { buildNotificationReceivedTrigger } from "./notification-delivery.service";
import { NotificationsResolver } from "./notifications.resolver";

describe("NotificationsResolver", () => {
  const notificationPreferences = {
    getMyPreferences: jest.fn(),
    updateMyPreferences: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the recipient-specific pubsub iterator for top-level subscription users", () => {
    const iterator = {} as AsyncIterableIterator<unknown>;
    const graphqlPubSub = {
      asyncIterableIterator: jest.fn().mockReturnValue(iterator),
    };

    const resolver = new NotificationsResolver(
      {} as never,
      notificationPreferences as never,
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
      notificationPreferences as never,
      graphqlPubSub as never,
    );

    expect(resolver.notificationReceived({ extra: { user: { id: 3 } } })).toBe(
      iterator,
    );
    expect(graphqlPubSub.asyncIterableIterator).toHaveBeenCalledWith(
      buildNotificationReceivedTrigger(3),
    );
  });

  it("delegates myNotificationPreferences to the preferences service", async () => {
    const preferences = {
      replyNotificationsEnabled: true,
      followRequestNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
    };
    notificationPreferences.getMyPreferences.mockResolvedValue(preferences);

    const resolver = new NotificationsResolver(
      {} as never,
      notificationPreferences as never,
      {} as never,
    );

    await expect(
      resolver.myNotificationPreferences({ id: 7 }),
    ).resolves.toEqual(preferences);
    expect(notificationPreferences.getMyPreferences).toHaveBeenCalledWith(7);
  });

  it("delegates updateNotificationPreferences to the preferences service", async () => {
    const input = { mentionNotificationsEnabled: false };
    const preferences = {
      replyNotificationsEnabled: true,
      followRequestNotificationsEnabled: true,
      mentionNotificationsEnabled: false,
    };
    notificationPreferences.updateMyPreferences.mockResolvedValue(preferences);

    const resolver = new NotificationsResolver(
      {} as never,
      notificationPreferences as never,
      {} as never,
    );

    await expect(
      resolver.updateNotificationPreferences({ id: 7 }, input),
    ).resolves.toEqual(preferences);
    expect(notificationPreferences.updateMyPreferences).toHaveBeenCalledWith(
      7,
      input,
    );
  });
});
