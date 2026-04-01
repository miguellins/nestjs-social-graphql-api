import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";

import { PasswordResetDeliveryService } from "@/auth/password-reset-delivery.service";
import { SALT_ROUNDS } from "@/common/constants/security.constants";
import { PasswordService } from "@/common/security/password.service";
import { PrismaService } from "@/prisma/prisma.service";

import { AuthService } from "./auth.service";

import * as bcrypt from "bcrypt";

describe("AuthService", () => {
  let service: AuthService;
  let passwordService: PasswordService;
  let moduleRef: TestingModule;

  const userFindUniqueMock = jest.fn();
  const userUpdateMock = jest.fn();
  const tokenFindUniqueMock = jest.fn();
  const tokenCreateMock = jest.fn();
  const tokenDeleteManyMock = jest.fn();
  const tokenUpdateManyMock = jest.fn();
  const signAsyncMock = jest.fn();
  const sendPasswordResetInstructionsMock = jest.fn();
  const configGetMock = jest.fn();

  const txMock = {
    user: {
      findUnique: userFindUniqueMock,
      update: userUpdateMock,
    },
    passwordResetToken: {
      findUnique: tokenFindUniqueMock,
      create: tokenCreateMock,
      deleteMany: tokenDeleteManyMock,
      updateMany: tokenUpdateManyMock,
    },
  };

  const prismaMock = {
    user: txMock.user,
    passwordResetToken: txMock.passwordResetToken,
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: typeof txMock) => Promise<unknown>)(txMock);
      }

      return Promise.all(arg as Promise<unknown>[]);
    }),
  } as unknown as PrismaService;

  const jwtMock = {
    signAsync: signAsyncMock,
  } as unknown as JwtService;

  const deliveryMock = {
    sendPasswordResetInstructions: sendPasswordResetInstructionsMock,
  } as unknown as PasswordResetDeliveryService;

  const configMock = {
    get: configGetMock,
  } as unknown as ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();

    configGetMock.mockImplementation((key: string) => {
      if (key === "PASSWORD_PEPPER") return "test-pepper";
      if (key === "PASSWORD_RESET_TOKEN_TTL_MINUTES") return 30;
      return undefined;
    });

    tokenDeleteManyMock.mockResolvedValue({ count: 0 });
    tokenCreateMock.mockResolvedValue({ id: 1 });
    tokenUpdateManyMock.mockResolvedValue({ count: 1 });

    moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: PasswordResetDeliveryService, useValue: deliveryMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    passwordService = moduleRef.get(PasswordService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("login", () => {
    it("throws BadRequestException when username is missing", async () => {
      await expect(
        service.login({ username: "", password: "123" }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.login({ username: "   ", password: "123" }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(userFindUniqueMock).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when password is missing", async () => {
      await expect(
        service.login({ username: "john", password: "" }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.login({ username: "john", password: "   " }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(userFindUniqueMock).not.toHaveBeenCalled();
    });

    it("normalizes username (trim + lowercase) before querying Prisma", async () => {
      userFindUniqueMock.mockResolvedValue(null);

      await expect(
        service.login({ username: "  JoHn  ", password: "pass" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(userFindUniqueMock).toHaveBeenCalledWith({
        where: { username: "john" },
        select: { id: true, username: true, password: true },
      });
    });

    it("throws UnauthorizedException when user is not found", async () => {
      userFindUniqueMock.mockResolvedValue(null);

      await expect(
        service.login({ username: "john", password: "pass" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(signAsyncMock).not.toHaveBeenCalled();
    });

    it("throws UnauthorizedException when password is invalid", async () => {
      userFindUniqueMock.mockResolvedValue({
        id: 1,
        username: "john",
        password: await passwordService.hashPassword("correct-password"),
      });

      await expect(
        service.login({ username: "john", password: "wrong" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(signAsyncMock).not.toHaveBeenCalled();
    });

    it("returns access_token when credentials are valid", async () => {
      userFindUniqueMock.mockResolvedValue({
        id: 7,
        username: "john",
        password: await passwordService.hashPassword("pass12345"),
      });

      signAsyncMock.mockResolvedValue("jwt.token.value");

      const result = await service.login({
        username: "  JOHN ",
        password: "  pass12345  ",
      });

      expect(userFindUniqueMock).toHaveBeenCalledWith({
        where: { username: "john" },
        select: { id: true, username: true, password: true },
      });
      expect(signAsyncMock).toHaveBeenCalledWith({ sub: 7 });
      expect(result).toEqual({ access_token: "jwt.token.value" });
    });

    it("upgrades a legacy hash after successful verification", async () => {
      const legacyHash = await bcrypt.hash("pass12345", SALT_ROUNDS);

      userFindUniqueMock.mockResolvedValue({
        id: 9,
        username: "john",
        password: legacyHash,
      });
      signAsyncMock.mockResolvedValue("jwt.token.value");

      const result = await service.login({
        username: "john",
        password: "pass12345",
      });

      const upgradedCalls = userUpdateMock.mock.calls as Array<
        [{ where?: { id?: number }; data?: { password?: string } }]
      >;
      const upgradedCall = upgradedCalls[0]?.[0];

      expect(upgradedCall?.where).toEqual({ id: 9 });
      expect(upgradedCall?.data?.password).toContain("bcrypt+hmac-sha256:v1$");
      expect(result).toEqual({ access_token: "jwt.token.value" });
    });

    it("throws InternalServerErrorException when jwt signing fails", async () => {
      userFindUniqueMock.mockResolvedValue({
        id: 1,
        username: "john",
        password: await passwordService.hashPassword("pass12345"),
      });
      signAsyncMock.mockRejectedValue(new Error("jwt fail"));

      await expect(
        service.login({ username: "john", password: "pass12345" }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      await expect(
        service.login({ username: "john", password: "pass12345" }),
      ).rejects.toThrow("Login failed");
    });

    it("throws InternalServerErrorException on Prisma known request error", async () => {
      const prismaErr = new Prisma.PrismaClientKnownRequestError("boom", {
        code: "P2002",
        clientVersion: "test",
      });

      userFindUniqueMock.mockRejectedValue(prismaErr);

      await expect(
        service.login({ username: "john", password: "pass12345" }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it("rethrows sanitized HttpExceptions from PasswordService unchanged", async () => {
      userFindUniqueMock.mockResolvedValue({
        id: 1,
        username: "john",
        password: "hashed",
      });

      const verifySpy = jest
        .spyOn(passwordService, "verifyPassword")
        .mockRejectedValueOnce(
          new InternalServerErrorException("Password processing failed"),
        );

      await expect(
        service.login({ username: "john", password: "pass" }),
      ).rejects.toThrow("Password processing failed");

      verifySpy.mockRestore();
    });

    it("throws InternalServerErrorException for unexpected errors", async () => {
      userFindUniqueMock.mockRejectedValue(new Error("random"));

      await expect(
        service.login({ username: "john", password: "pass" }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe("requestPasswordReset", () => {
    it("returns the same generic response when the account does not exist", async () => {
      userFindUniqueMock.mockResolvedValue(null);

      const result = await service.requestPasswordReset({
        email: "  Missing@Example.com  ",
      });

      expect(userFindUniqueMock).toHaveBeenCalledWith({
        where: { email: "missing@example.com" },
        select: { id: true, email: true },
      });
      expect(result).toEqual({
        message:
          "If an account with that email exists, password reset instructions will be sent",
      });
      expect(tokenCreateMock).not.toHaveBeenCalled();
      expect(sendPasswordResetInstructionsMock).not.toHaveBeenCalled();
    });

    it("creates a hashed token for an existing user and still returns the generic response", async () => {
      userFindUniqueMock.mockResolvedValue({
        id: 42,
        email: "user@example.com",
      });

      const result = await service.requestPasswordReset({
        email: "USER@EXAMPLE.COM",
      });

      expect(tokenDeleteManyMock).toHaveBeenCalledWith({
        where: { userId: 42 },
      });
      const tokenCreateCalls = tokenCreateMock.mock.calls as Array<
        [
          {
            data?: {
              userId?: number;
              tokenHash?: string;
              expiresAt?: Date;
            };
          },
        ]
      >;
      const deliveryCalls = sendPasswordResetInstructionsMock.mock.calls as [
        {
          email?: string;
          token?: string;
          expiresAt?: Date;
        },
      ][];
      const tokenCreateCall = tokenCreateCalls[0]?.[0];
      const deliveryCall = deliveryCalls[0]?.[0];

      expect(tokenCreateCall?.data?.userId).toBe(42);
      expect(tokenCreateCall?.data?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(tokenCreateCall?.data?.expiresAt).toBeInstanceOf(Date);
      expect(deliveryCall?.email).toBe("user@example.com");
      expect(deliveryCall?.token).toEqual(expect.any(String));
      expect(deliveryCall?.expiresAt).toBeInstanceOf(Date);
      expect(deliveryCall?.token).not.toEqual(tokenCreateCall?.data?.tokenHash);
      expect(result).toEqual({
        message:
          "If an account with that email exists, password reset instructions will be sent",
      });
    });

    it("returns the same generic response for existing and missing accounts", async () => {
      userFindUniqueMock
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 11, email: "user@example.com" });

      const missing = await service.requestPasswordReset({
        email: "missing@example.com",
      });
      const existing = await service.requestPasswordReset({
        email: "user@example.com",
      });

      expect(missing).toEqual(existing);
    });
  });

  describe("resetPassword", () => {
    it("throws BadRequestException when the new password is invalid", async () => {
      await expect(
        service.resetPassword({ token: "valid-token", newPassword: "short" }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tokenFindUniqueMock).not.toHaveBeenCalled();
    });

    it("throws BadRequestException for an invalid token", async () => {
      tokenFindUniqueMock.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: "invalid-token",
          newPassword: "new-password-123",
        }),
      ).rejects.toThrow("Invalid password reset token");
    });

    it("throws BadRequestException for an expired token", async () => {
      tokenFindUniqueMock.mockResolvedValue({
        id: 1,
        userId: 9,
        usedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        service.resetPassword({
          token: "expired-token",
          newPassword: "new-password-123",
        }),
      ).rejects.toThrow("Password reset token has expired");
    });

    it("throws BadRequestException for a reused token", async () => {
      tokenFindUniqueMock.mockResolvedValue({
        id: 1,
        userId: 9,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.resetPassword({
          token: "used-token",
          newPassword: "new-password-123",
        }),
      ).rejects.toThrow("Password reset token has already been used");
    });

    it("updates the password, marks the token used, and clears sibling tokens", async () => {
      tokenFindUniqueMock.mockResolvedValue({
        id: 8,
        userId: 13,
        usedAt: null,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });

      const result = await service.resetPassword({
        token: "valid-reset-token",
        newPassword: "new-password-123",
      });

      const consumeCalls = tokenUpdateManyMock.mock.calls as Array<
        [
          {
            where?: {
              id?: number;
              usedAt?: null;
              expiresAt?: { gt?: Date };
            };
            data?: {
              usedAt?: Date;
            };
          },
        ]
      >;
      const passwordUpdateCalls = userUpdateMock.mock.calls as Array<
        [
          {
            where?: { id?: number };
            data?: { password?: string };
          },
        ]
      >;
      const consumeCall = consumeCalls[0]?.[0];
      const passwordUpdateCall = passwordUpdateCalls[0]?.[0];

      expect(consumeCall?.where?.id).toBe(8);
      expect(consumeCall?.where?.usedAt).toBeNull();
      expect(consumeCall?.where?.expiresAt?.gt).toBeInstanceOf(Date);
      expect(consumeCall?.data?.usedAt).toBeInstanceOf(Date);
      expect(passwordUpdateCall?.where).toEqual({ id: 13 });
      expect(passwordUpdateCall?.data?.password).toContain(
        "bcrypt+hmac-sha256:v1$",
      );
      expect(tokenDeleteManyMock).toHaveBeenCalledWith({
        where: {
          userId: 13,
          id: { not: 8 },
        },
      });
      expect(result).toEqual({ message: "Password reset successful" });
    });

    it("makes the old password unusable after a successful reset", async () => {
      let storedPassword =
        await passwordService.hashPassword("old-password-123");

      userFindUniqueMock.mockImplementation(
        ({ where }: { where?: { username?: string } }) => {
          if (where?.username === "john") {
            return {
              id: 5,
              username: "john",
              password: storedPassword,
            };
          }

          return Promise.resolve(null);
        },
      );

      userUpdateMock.mockImplementation(
        ({ data }: { data?: { password?: string } }) => {
          if (data?.password) {
            storedPassword = data.password;
          }

          return Promise.resolve({ id: 5 });
        },
      );

      tokenFindUniqueMock.mockResolvedValue({
        id: 3,
        userId: 5,
        usedAt: null,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });
      signAsyncMock.mockResolvedValue("jwt.token.value");

      await service.resetPassword({
        token: "valid-reset-token",
        newPassword: "new-password-123",
      });

      await expect(
        service.login({ username: "john", password: "old-password-123" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      await expect(
        service.login({ username: "john", password: "new-password-123" }),
      ).resolves.toEqual({ access_token: "jwt.token.value" });
    });
  });
});
