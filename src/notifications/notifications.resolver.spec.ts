import { buildNotificationReceivedTrigger } from "./notification-delivery.service";
import { NotificationsResolver } from "./notifications.resolver";

describe("NotificationsResolver", () => {
  const notificationPreferences = {
    getMyPreferences: jest.fn(),
    updateMyPreferences: jest.fn(),
  };
  const actorPreferences = {
    findMySilencedActors: jest.fn(),
    silenceActor: jest.fn(),
    unsilenceActor: jest.fn(),
  };
  const mutesService = {
    findMyMutedUsers: jest.fn(),
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
      actorPreferences as never,
      mutesService as never,
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
      actorPreferences as never,
      mutesService as never,
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
      actorPreferences as never,
      mutesService as never,
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
      actorPreferences as never,
      mutesService as never,
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

  it("delegates actor silence mutations to the actor preference service", async () => {
    actorPreferences.silenceActor.mockResolvedValue({ id: 1 });
    actorPreferences.unsilenceActor.mockResolvedValue(true);
    const resolver = new NotificationsResolver(
      {} as never,
      notificationPreferences as never,
      actorPreferences as never,
      mutesService as never,
      {} as never,
    );

    await expect(
      resolver.silenceNotificationsFromActor({ id: 7 }, 2),
    ).resolves.toEqual({ id: 1 });
    await expect(
      resolver.unsilenceNotificationsFromActor({ id: 7 }, 2),
    ).resolves.toBe(true);
    expect(actorPreferences.silenceActor).toHaveBeenCalledWith(7, 2);
    expect(actorPreferences.unsilenceActor).toHaveBeenCalledWith(7, 2);
  });

  it("returns unified interaction preferences with nested pages", async () => {
    const preferences = {
      replyNotificationsEnabled: true,
      followRequestNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
    };
    const mutedUsers = { items: [], pageInfo: { endCursor: null } };
    const silencedActors = { items: [], pageInfo: { endCursor: null } };
    notificationPreferences.getMyPreferences.mockResolvedValue(preferences);
    mutesService.findMyMutedUsers.mockResolvedValue(mutedUsers);
    actorPreferences.findMySilencedActors.mockResolvedValue(silencedActors);
    const resolver = new NotificationsResolver(
      {} as never,
      notificationPreferences as never,
      actorPreferences as never,
      mutesService as never,
      {} as never,
    );

    await expect(
      resolver.myInteractionPreferences({ id: 7 }, 5, "m", 6, "s"),
    ).resolves.toEqual({
      notificationPreferences: preferences,
      mutedUsers,
      silencedActors,
    });
    expect(mutesService.findMyMutedUsers).toHaveBeenCalledWith(7, {
      first: 5,
      after: "m",
    });
    expect(actorPreferences.findMySilencedActors).toHaveBeenCalledWith(7, {
      first: 6,
      after: "s",
    });
  });
});
