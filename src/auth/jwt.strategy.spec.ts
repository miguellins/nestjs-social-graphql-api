import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy", () => {
  const originalSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
      return;
    }

    process.env.JWT_SECRET = originalSecret;
  });

  it("throws when JWT_SECRET is not set", () => {
    delete process.env.JWT_SECRET;

    expect(() => new JwtStrategy()).toThrow("JWT_SECRET is not set");
  });

  it("creates strategy and maps payload.sub to user id", () => {
    process.env.JWT_SECRET = "test-secret";

    const strategy = new JwtStrategy();

    expect(strategy).toBeInstanceOf(JwtStrategy);
    expect(strategy.validate({ sub: 42 })).toEqual({ id: 42 });
  });
});
