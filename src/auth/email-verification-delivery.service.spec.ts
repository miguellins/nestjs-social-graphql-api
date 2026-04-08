import { InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { EmailVerificationDeliveryService } from "@/auth/email-verification-delivery.service";

import { readFile, unlink } from "fs/promises";
import { join } from "path";

describe("EmailVerificationDeliveryService", () => {
  let service: EmailVerificationDeliveryService;
  let moduleRef: TestingModule;
  const configGetMock = jest.fn();
  const devEmailVerificationFile = join(
    "/tmp",
    "nestjs-graphql-email-verification.json",
  );

  beforeEach(async () => {
    jest.clearAllMocks();

    moduleRef = await Test.createTestingModule({
      providers: [
        EmailVerificationDeliveryService,
        {
          provide: ConfigService,
          useValue: {
            get: configGetMock,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(EmailVerificationDeliveryService);
  });

  afterEach(async () => {
    await unlink(devEmailVerificationFile).catch(() => undefined);
    await moduleRef?.close();
  });

  it("writes the raw verification token to a local file in development", async () => {
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

    await service.sendEmailVerificationInstructions({
      email: "user@example.com",
      token: "raw-verification-token",
      expiresAt: new Date("2026-04-08T12:00:00.000Z"),
    });

    const fileContents = await readFile(devEmailVerificationFile, "utf8");

    expect(JSON.parse(fileContents)).toEqual({
      email: "user@example.com",
      token: "raw-verification-token",
      expiresAt: "2026-04-08T12:00:00.000Z",
    });
    expect(logSpy).toHaveBeenCalledWith(
      "Email verification instructions written to /tmp/nestjs-graphql-email-verification.json",
    );
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("writes the raw verification token to a local file in test", async () => {
    configGetMock.mockImplementation((key: string) => {
      if (key === "NODE_ENV") return "test";
      return undefined;
    });

    const logSpy = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);

    await service.sendEmailVerificationInstructions({
      email: "user@example.com",
      token: "raw-verification-token",
      expiresAt: new Date("2026-04-08T12:00:00.000Z"),
    });

    const fileContents = await readFile(devEmailVerificationFile, "utf8");

    expect(JSON.parse(fileContents)).toEqual({
      email: "user@example.com",
      token: "raw-verification-token",
      expiresAt: "2026-04-08T12:00:00.000Z",
    });
    expect(logSpy).toHaveBeenCalledWith(
      "Email verification instructions written to /tmp/nestjs-graphql-email-verification.json",
    );

    logSpy.mockRestore();
  });

  it("warns without logging the raw token and throws in production", async () => {
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

    await expect(
      service.sendEmailVerificationInstructions({
        email: "user@example.com",
        token: "raw-verification-token",
        expiresAt: new Date("2026-04-08T12:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "Email verification delivery is not configured. Generated instructions expire at 2026-04-08T12:00:00.000Z.",
    );

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
