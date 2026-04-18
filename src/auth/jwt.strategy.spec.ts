import { ConfigService } from "@nestjs/config";

import { USER_ROLE } from "@/users/enums/user-role.enum";
import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy", () => {
  const configMock = {
    get: jest.fn(),
  } as unknown as ConfigService;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("throws when JWT_SECRET is not set", () => {
    configMock.get = jest.fn().mockReturnValue(undefined);

    expect(() => new JwtStrategy(configMock)).toThrow("JWT_SECRET is not set");
  });

  it("creates strategy and maps payload.sub to user id", () => {
    configMock.get = jest.fn().mockReturnValue("test-secret");

    const strategy = new JwtStrategy(configMock);

    expect(strategy).toBeInstanceOf(JwtStrategy);
    expect(
      strategy.validate({ sub: 42, role: USER_ROLE.ADMIN, sid: 7 }),
    ).toEqual({
      id: 42,
      role: USER_ROLE.ADMIN,
      sessionId: 7,
    });
  });
});
