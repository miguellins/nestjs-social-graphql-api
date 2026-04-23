import { Logger } from "@nestjs/common";

import { setupLogger } from "@/bootstrap/setup-logger";
import { AppLoggerService } from "@/common/logging/app-logger.service";

describe("setupLogger", () => {
  it("registers the shared structured logger for Nest and static Logger usage", () => {
    const logger = {} as AppLoggerService;
    const app = {
      get: jest.fn(() => logger),
      useLogger: jest.fn(),
    };
    const overrideLoggerSpy = jest
      .spyOn(Logger, "overrideLogger")
      .mockImplementation(() => undefined);

    setupLogger(app as never);

    expect(app.get).toHaveBeenCalledWith(AppLoggerService);
    expect(app.useLogger).toHaveBeenCalledWith(logger);
    expect(overrideLoggerSpy).toHaveBeenCalledWith(logger);
  });
});
