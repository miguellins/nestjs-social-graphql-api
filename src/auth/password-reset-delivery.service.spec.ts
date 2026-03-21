import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { PasswordResetDeliveryService } from "@/auth/password-reset-delivery.service";

import { readFile, unlink } from "fs/promises";
import { join } from "path";

describe("PasswordResetDeliveryService", () => {
  let service: PasswordResetDeliveryService;
  let moduleRef: TestingModule;
  const configGetMock = jest.fn();
  const devPasswordResetFile = join(
    "/tmp",
    "nestjs-graphql-password-reset.json",
  );

  beforeEach(async () => {
    jest.clearAllMocks();

    moduleRef = await Test.createTestingModule({
      providers: [
        PasswordResetDeliveryService,
        {
          provide: ConfigService,
          useValue: {
            get: configGetMock,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(PasswordResetDeliveryService);
  });

  afterEach(async () => {
    await unlink(devPasswordResetFile).catch(() => undefined);
    await moduleRef?.close();
  });

  it("writes the raw reset token to a local file in development", async () => {
    configGetMock.mockImplementation((key: string) => {
      if (key === "NODE_ENV") return "development";
      return undefined;
    });

    const logSpy = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);

    await service.sendPasswordResetInstructions({
      email: "user@example.com",
      token: "raw-reset-token",
      expiresAt: new Date("2026-03-21T12:00:00.000Z"),
    });

    const fileContents = await readFile(devPasswordResetFile, "utf8");

    expect(JSON.parse(fileContents)).toEqual({
      email: "user@example.com",
      token: "raw-reset-token",
      expiresAt: "2026-03-21T12:00:00.000Z",
    });
    expect(logSpy).toHaveBeenCalledWith(
      "Password reset instructions written to /tmp/nestjs-graphql-password-reset.json",
    );
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("writes the raw reset token to a local file in test", async () => {
    configGetMock.mockImplementation((key: string) => {
      if (key === "NODE_ENV") return "test";
      return undefined;
    });

    const logSpy = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);

    await service.sendPasswordResetInstructions({
      email: "user@example.com",
      token: "raw-reset-token",
      expiresAt: new Date("2026-03-21T12:00:00.000Z"),
    });

    const fileContents = await readFile(devPasswordResetFile, "utf8");

    expect(JSON.parse(fileContents)).toEqual({
      email: "user@example.com",
      token: "raw-reset-token",
      expiresAt: "2026-03-21T12:00:00.000Z",
    });
    expect(logSpy).toHaveBeenCalledWith(
      "Password reset instructions written to /tmp/nestjs-graphql-password-reset.json",
    );

    logSpy.mockRestore();
  });

  it("does not log the raw reset token in production", async () => {
    configGetMock.mockImplementation((key: string) => {
      if (key === "NODE_ENV") return "production";
      return undefined;
    });

    const logSpy = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);

    await service.sendPasswordResetInstructions({
      email: "user@example.com",
      token: "raw-reset-token",
      expiresAt: new Date("2026-03-21T12:00:00.000Z"),
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "Password reset delivery is not configured. Generated instructions expire at 2026-03-21T12:00:00.000Z.",
    );

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
