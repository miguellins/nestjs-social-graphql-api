import helmet from "helmet";

import { setupSecurity } from "@/bootstrap/setup-security";

jest.mock("helmet", () => jest.fn(() => "helmet-middleware"));

describe("setupSecurity", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.clearAllMocks();
  });

  it("disables content security policy outside production", () => {
    process.env.NODE_ENV = "development";
    const app = {
      use: jest.fn(),
    };

    setupSecurity(app as never);

    expect(helmet).toHaveBeenCalledWith({
      contentSecurityPolicy: false,
    });
    expect(app.use).toHaveBeenCalledWith("helmet-middleware");
  });

  it("uses helmet defaults in production", () => {
    process.env.NODE_ENV = "production";
    const app = {
      use: jest.fn(),
    };

    setupSecurity(app as never);

    expect(helmet).toHaveBeenCalledWith({
      contentSecurityPolicy: undefined,
    });
    expect(app.use).toHaveBeenCalledWith("helmet-middleware");
  });
});
