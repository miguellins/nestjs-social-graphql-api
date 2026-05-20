import { MutesResolver } from "./mutes.resolver";
import { MuteScope } from "@/mutes/enums/mute-scope.enum";

describe("MutesResolver", () => {
  it("forwards muteUser input to the service", async () => {
    const mutesService = {
      muteUser: jest.fn().mockResolvedValue({
        id: 10,
        muterId: 1,
        mutedUserId: 2,
        scopes: [MuteScope.POSTS],
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      }),
    };

    const resolver = new MutesResolver(mutesService as never);

    await resolver.muteUser(
      { userId: 2, scopes: [MuteScope.POSTS] },
      { id: 1 },
    );

    expect(mutesService.muteUser).toHaveBeenCalledWith(1, 2, [MuteScope.POSTS]);
  });
});
