import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";

import { EmailVerificationDeliveryService } from "@/auth/email-verification-delivery.service";
import { PasswordResetDeliveryService } from "@/auth/password-reset-delivery.service";
import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";
import { SALT_ROUNDS } from "@/common/constants/security.constants";
import { PasswordService } from "@/common/security/password.service";
import { PrismaService } from "@/prisma/prisma.service";
import { AccountState } from "@/users/enums/account-state.enum";
import { USER_ROLE } from "@/users/enums/user-role.enum";

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
  const emailVerificationFindUniqueMock = jest.fn();
  const emailVerificationCreateMock = jest.fn();
  const emailVerificationDeleteManyMock = jest.fn();
  const emailVerificationUpdateManyMock = jest.fn();
  const refreshSessionFindFirstMock = jest.fn();
  const refreshSessionCreateMock = jest.fn();
  const refreshSessionUpdateManyMock = jest.fn();
  const signAsyncMock = jest.fn();
  const sendEmailVerificationInstructionsMock = jest.fn();
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
    emailVerificationToken: {
      findUnique: emailVerificationFindUniqueMock,
      create: emailVerificationCreateMock,
      deleteMany: emailVerificationDeleteManyMock,
      updateMany: emailVerificationUpdateManyMock,
    },
    refreshSession: {
      findFirst: refreshSessionFindFirstMock,
      create: refreshSessionCreateMock,
      updateMany: refreshSessionUpdateManyMock,
    },
  };

  const prismaMock = {
    user: txMock.user,
    passwordResetToken: txMock.passwordResetToken,
    emailVerificationToken: txMock.emailVerificationToken,
    refreshSession: txMock.refreshSession,
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

  const emailVerificationDeliveryMock = {
    sendEmailVerificationInstructions: sendEmailVerificationInstructionsMock,
  } as unknown as EmailVerificationDeliveryService;

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
      if (key === "EMAIL_VERIFICATION_TTL_HOURS") return 24;
      if (key === "PASSWORD_RESET_TOKEN_TTL_MINUTES") return 30;
      if (key === "REFRESH_SESSION_TTL_DAYS") return 30;
      return undefined;
    });

    emailVerificationDeleteManyMock.mockResolvedValue({ count: 0 });
    emailVerificationCreateMock.mockResolvedValue({ id: 1 });
    emailVerificationUpdateManyMock.mockResolvedValue({ count: 1 });
    tokenDeleteManyMock.mockResolvedValue({ count: 0 });
    tokenCreateMock.mockResolvedValue({ id: 1 });
    tokenUpdateManyMock.mockResolvedValue({ count: 1 });
    refreshSessionCreateMock.mockResolvedValue({ id: 1 });
    refreshSessionUpdateManyMock.mockResolvedValue({ count: 1 });

    moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        {
          provide: EmailVerificationDeliveryService,
          useValue: emailVerificationDeliveryMock,
        },
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
        select: {
          id: true,
          username: true,
          password: true,
          role: true,
          accountState: true,
        },
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
        role: USER_ROLE.USER,
        accountState: AccountState.ACTIVE,
      });

      await expect(
        service.login({ username: "john", password: "wrong" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(signAsyncMock).not.toHaveBeenCalled();
    });

    it("rejects deactivated accounts with a sanitized error code", async () => {
      userFindUniqueMock.mockResolvedValue({
        id: 1,
        username: "john",
        password: await passwordService.hashPassword("pass12345"),
        role: USER_ROLE.USER,
        accountState: AccountState.DEACTIVATED,
      });

      await expect(
        service.login({ username: "john", password: "pass12345" }),
      ).rejects.toMatchObject({
        response: {
          message: "This account is deactivated",
          code: GRAPHQL_ERROR_CODES.ACCOUNT_DEACTIVATED,
        },
      });

      expect(signAsyncMock).not.toHaveBeenCalled();
      expect(refreshSessionCreateMock).not.toHaveBeenCalled();
    });

    it("returns access_token and refreshToken when credentials are valid", async () => {
      userFindUniqueMock.mockResolvedValue({
        id: 7,
        username: "john",
        password: await passwordService.hashPassword("pass12345"),
        role: USER_ROLE.USER,
        accountState: AccountState.ACTIVE,
      });

      signAsyncMock.mockResolvedValue("jwt.token.value");

      const result = await service.login({
        username: "  JOHN ",
        password: "  pass12345  ",
      });

      expect(userFindUniqueMock).toHaveBeenCalledWith({
        where: { username: "john" },
        select: {
          id: true,
          username: true,
          password: true,
          role: true,
          accountState: true,
        },
      });
      expect(signAsyncMock).toHaveBeenCalledWith({
        sub: 7,
        role: USER_ROLE.USER,
        sid: 1,
      });
      const refreshSessionCreateCalls = refreshSessionCreateMock.mock
        .calls as Array<
        [
          {
            data?: {
              userId?: number;
              tokenHash?: string;
              expiresAt?: Date;
            };
            select?: { id?: true };
          },
        ]
      >;
      const refreshSessionCreateCall = refreshSessionCreateCalls[0]?.[0];

      expect(refreshSessionCreateCall?.data?.userId).toBe(7);
      expect(refreshSessionCreateCall?.data?.tokenHash).toEqual(
        expect.any(String),
      );
      expect(refreshSessionCreateCall?.data?.expiresAt).toBeInstanceOf(Date);
      expect(result.access_token).toBe("jwt.token.value");
      expect(result.refreshToken).toEqual(expect.any(String));
    });

    it("upgrades a legacy hash after successful verification", async () => {
      const legacyHash = await bcrypt.hash("pass12345", SALT_ROUNDS);

      userFindUniqueMock.mockResolvedValue({
        id: 9,
        username: "john",
        password: legacyHash,
        role: USER_ROLE.USER,
        accountState: AccountState.ACTIVE,
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
      expect(result.access_token).toBe("jwt.token.value");
      expect(result.refreshToken).toEqual(expect.any(String));
    });

    it("throws InternalServerErrorException when jwt signing fails", async () => {
      const verifySpy = jest
        .spyOn(passwordService, "verifyPassword")
        .mockResolvedValue({
          isValid: true,
        });

      userFindUniqueMock.mockResolvedValue({
        id: 1,
        username: "john",
        password: "stored-hash",
        role: USER_ROLE.USER,
        accountState: AccountState.ACTIVE,
      });
      signAsyncMock.mockRejectedValue(new Error("jwt fail"));

      await expect(
        service.login({ username: "john", password: "pass12345" }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      await expect(
        service.login({ username: "john", password: "pass12345" }),
      ).rejects.toThrow("Login failed");

      verifySpy.mockRestore();
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
        role: USER_ROLE.USER,
        accountState: AccountState.ACTIVE,
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

  describe("refreshSession", () => {
    it("rotates a valid refresh session and returns a new token pair", async () => {
      refreshSessionFindFirstMock.mockResolvedValue({
        id: 11,
        userId: 7,
        user: {
          role: USER_ROLE.MODERATOR,
          accountState: AccountState.ACTIVE,
        },
      });
      refreshSessionUpdateManyMock.mockResolvedValue({ count: 1 });
      signAsyncMock.mockResolvedValue("jwt.token.value");

      const result = await service.refreshSession({
        refreshToken: "raw-refresh-token",
      });

      const refreshFindCalls = refreshSessionFindFirstMock.mock.calls as Array<
        [
          {
            where?: {
              tokenHash?: string;
              revokedAt?: null;
              expiresAt?: { gt?: Date };
            };
            select?: {
              id?: true;
              userId?: true;
              user?: { select?: { role?: true; accountState?: true } };
            };
          },
        ]
      >;
      const refreshFindCall = refreshFindCalls[0]?.[0];
      const refreshUpdateCalls = refreshSessionUpdateManyMock.mock
        .calls as Array<
        [
          {
            where?: {
              id?: number;
              tokenHash?: string;
              revokedAt?: null;
              expiresAt?: { gt?: Date };
            };
            data?: {
              tokenHash?: string;
              expiresAt?: Date;
              lastUsedAt?: Date;
              userAgent?: string;
              ipAddress?: string;
            };
          },
        ]
      >;
      const refreshUpdateCall = refreshUpdateCalls[0]?.[0];

      expect(refreshFindCall?.where?.tokenHash).toEqual(expect.any(String));
      expect(refreshFindCall?.where?.revokedAt).toBeNull();
      expect(refreshFindCall?.where?.expiresAt?.gt).toBeInstanceOf(Date);
      expect(refreshFindCall?.select).toEqual({
        id: true,
        userId: true,
        user: {
          select: {
            role: true,
            accountState: true,
          },
        },
      });
      expect(refreshUpdateCall?.where?.id).toBe(11);
      expect(refreshUpdateCall?.where?.tokenHash).toEqual(expect.any(String));
      expect(refreshUpdateCall?.where?.revokedAt).toBeNull();
      expect(refreshUpdateCall?.where?.expiresAt?.gt).toBeInstanceOf(Date);
      expect(refreshUpdateCall?.data?.tokenHash).toEqual(expect.any(String));
      expect(refreshUpdateCall?.data?.expiresAt).toBeInstanceOf(Date);
      expect(refreshUpdateCall?.data?.lastUsedAt).toBeInstanceOf(Date);
      expect(refreshSessionCreateMock).not.toHaveBeenCalled();
      expect(signAsyncMock).toHaveBeenCalledWith({
        sub: 7,
        role: USER_ROLE.MODERATOR,
        sid: 11,
      });
      expect(result.access_token).toBe("jwt.token.value");
      expect(result.refreshToken).toEqual(expect.any(String));
    });

    it("persists updated session metadata during rotation", async () => {
      refreshSessionFindFirstMock.mockResolvedValue({
        id: 11,
        userId: 7,
        user: {
          role: USER_ROLE.MODERATOR,
          accountState: AccountState.ACTIVE,
        },
      });
      refreshSessionUpdateManyMock.mockResolvedValue({ count: 1 });
      signAsyncMock.mockResolvedValue("jwt.token.value");

      await service.refreshSession(
        { refreshToken: "raw-refresh-token" },
        {
          userAgent: "Mozilla/5.0 Updated Browser",
          ipAddress: "203.0.113.10",
        },
      );

      const refreshUpdateCalls = refreshSessionUpdateManyMock.mock
        .calls as Array<
        [
          {
            data?: {
              userAgent?: string;
              ipAddress?: string;
            };
          },
        ]
      >;
      const rotateCall = refreshUpdateCalls[0]?.[0];

      expect(rotateCall?.data?.userAgent).toBe("Mozilla/5.0 Updated Browser");
      expect(rotateCall?.data?.ipAddress).toBe("203.0.113.10");
    });

    it("rejects a missing refresh session", async () => {
      refreshSessionFindFirstMock.mockResolvedValue(null);

      await expect(
        service.refreshSession({ refreshToken: "missing" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(signAsyncMock).not.toHaveBeenCalled();
    });

    it("rejects a revoked refresh session", async () => {
      refreshSessionFindFirstMock.mockResolvedValue(null);

      await expect(
        service.refreshSession({ refreshToken: "revoked" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rejects reusing the old refresh token after a successful rotation", async () => {
      refreshSessionFindFirstMock
        .mockResolvedValueOnce({
          id: 11,
          userId: 7,
          user: {
            role: USER_ROLE.MODERATOR,
            accountState: AccountState.ACTIVE,
          },
        })
        .mockResolvedValueOnce(null);
      refreshSessionUpdateManyMock.mockResolvedValue({ count: 1 });
      signAsyncMock.mockResolvedValue("jwt.token.value");

      await service.refreshSession({
        refreshToken: "old-refresh-token",
      });

      await expect(
        service.refreshSession({ refreshToken: "old-refresh-token" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("revokes all active sessions and rejects deactivated accounts", async () => {
      refreshSessionFindFirstMock.mockResolvedValue({
        id: 11,
        userId: 7,
        user: {
          role: USER_ROLE.MODERATOR,
          accountState: AccountState.DEACTIVATED,
        },
      });
      refreshSessionUpdateManyMock
        .mockResolvedValueOnce({ count: 3 })
        .mockResolvedValueOnce({ count: 0 });

      await expect(
        service.refreshSession({ refreshToken: "raw-refresh-token" }),
      ).rejects.toMatchObject({
        response: {
          message: "This account is deactivated",
          code: GRAPHQL_ERROR_CODES.ACCOUNT_DEACTIVATED,
        },
      });

      expect(refreshSessionUpdateManyMock).toHaveBeenCalledTimes(1);
      const refreshUpdateCalls = refreshSessionUpdateManyMock.mock
        .calls as Array<
        [
          {
            where?: {
              userId?: number;
              revokedAt?: null;
            };
            data?: {
              revokedAt?: Date;
            };
          },
        ]
      >;
      const revokeAllCall = refreshUpdateCalls[0]?.[0];

      expect(revokeAllCall?.where).toEqual({
        userId: 7,
        revokedAt: null,
      });
      expect(revokeAllCall?.data?.revokedAt).toBeInstanceOf(Date);
      expect(signAsyncMock).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("revokes the matching refresh session and returns a success message", async () => {
      refreshSessionUpdateManyMock.mockResolvedValue({ count: 1 });

      const result = await service.logout({
        refreshToken: "raw-refresh-token",
      });

      const logoutCalls = refreshSessionUpdateManyMock.mock.calls as Array<
        [
          {
            where?: { tokenHash?: string; revokedAt?: null };
            data?: { revokedAt?: Date };
          },
        ]
      >;
      const logoutCall = logoutCalls[0]?.[0];

      expect(logoutCall?.where?.tokenHash).toEqual(expect.any(String));
      expect(logoutCall?.where?.revokedAt).toBeNull();
      expect(logoutCall?.data?.revokedAt).toBeInstanceOf(Date);
      expect(result).toEqual({
        message: "Logged out successfully",
      });
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

  describe("requestEmailVerification", () => {
    it("creates a hashed token for an unverified user and returns the generic response", async () => {
      userFindUniqueMock.mockResolvedValue({
        id: 42,
        email: "user@example.com",
        isEmailVerified: false,
      });

      const result = await service.requestEmailVerification(42);

      expect(userFindUniqueMock).toHaveBeenCalledWith({
        where: { id: 42 },
        select: {
          id: true,
          email: true,
          isEmailVerified: true,
        },
      });
      expect(emailVerificationDeleteManyMock).toHaveBeenCalledWith({
        where: {
          userId: 42,
          usedAt: null,
        },
      });
      const createCalls = emailVerificationCreateMock.mock.calls as Array<
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
      const deliveryCalls = sendEmailVerificationInstructionsMock.mock
        .calls as Array<
        [
          {
            email?: string;
            token?: string;
            expiresAt?: Date;
          },
        ]
      >;
      const createCall = createCalls[0]?.[0];
      const deliveryCall = deliveryCalls[0]?.[0];

      expect(createCall?.data?.userId).toBe(42);
      expect(createCall?.data?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(createCall?.data?.expiresAt).toBeInstanceOf(Date);
      expect(deliveryCall?.email).toBe("user@example.com");
      expect(deliveryCall?.token).toEqual(expect.any(String));
      expect(deliveryCall?.expiresAt).toBeInstanceOf(Date);
      expect(deliveryCall?.token).not.toEqual(createCall?.data?.tokenHash);
      expect(result).toEqual({
        message:
          "Verification instructions generated if your account is eligible.",
      });
    });

    it("returns the generic response and does nothing for an already verified user", async () => {
      userFindUniqueMock.mockResolvedValue({
        id: 42,
        email: "user@example.com",
        isEmailVerified: true,
      });

      const result = await service.requestEmailVerification(42);

      expect(emailVerificationDeleteManyMock).not.toHaveBeenCalled();
      expect(emailVerificationCreateMock).not.toHaveBeenCalled();
      expect(sendEmailVerificationInstructionsMock).not.toHaveBeenCalled();
      expect(result).toEqual({
        message:
          "Verification instructions generated if your account is eligible.",
      });
    });

    it("fails when verification delivery fails and cleans up the active token", async () => {
      userFindUniqueMock.mockResolvedValue({
        id: 42,
        email: "user@example.com",
        isEmailVerified: false,
      });
      sendEmailVerificationInstructionsMock.mockRejectedValueOnce(
        new InternalServerErrorException("Delivery failed"),
      );

      await expect(service.requestEmailVerification(42)).rejects.toThrow(
        "Delivery failed",
      );

      const deleteCalls = emailVerificationDeleteManyMock.mock.calls as Array<
        [
          {
            where?: {
              userId?: number;
              usedAt?: null;
              tokenHash?: string;
            };
          },
        ]
      >;
      const cleanupCall = deleteCalls[1]?.[0];

      expect(cleanupCall?.where?.userId).toBe(42);
      expect(cleanupCall?.where?.usedAt).toBeNull();
      expect(cleanupCall?.where?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
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
      ).resolves.toMatchObject({
        access_token: "jwt.token.value",
      });
    });
  });

  describe("verifyEmail", () => {
    it("marks the user verified, consumes the token, and clears sibling tokens", async () => {
      emailVerificationFindUniqueMock.mockResolvedValue({
        id: 8,
        userId: 13,
        usedAt: null,
        expiresAt: new Date(Date.now() + 10 * 60 * 60_000),
      });

      const result = await service.verifyEmail({
        token: "valid-verification-token",
      });

      const consumeCalls = emailVerificationUpdateManyMock.mock.calls as Array<
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
      const userUpdateCalls = userUpdateMock.mock.calls as Array<
        [
          {
            where?: { id?: number };
            data?: { isEmailVerified?: boolean };
          },
        ]
      >;
      const consumeCall = consumeCalls[0]?.[0];
      const verifiedUpdateCall = userUpdateCalls[0]?.[0];

      expect(consumeCall?.where?.id).toBe(8);
      expect(consumeCall?.where?.usedAt).toBeNull();
      expect(consumeCall?.where?.expiresAt?.gt).toBeInstanceOf(Date);
      expect(consumeCall?.data?.usedAt).toBeInstanceOf(Date);
      expect(verifiedUpdateCall?.where).toEqual({ id: 13 });
      expect(verifiedUpdateCall?.data).toEqual({ isEmailVerified: true });
      expect(emailVerificationDeleteManyMock).toHaveBeenCalledWith({
        where: {
          userId: 13,
          id: { not: 8 },
          usedAt: null,
        },
      });
      expect(result).toEqual({ message: "Email verified successfully" });
    });

    it("rejects an invalid token", async () => {
      emailVerificationFindUniqueMock.mockResolvedValue(null);

      await expect(
        service.verifyEmail({ token: "invalid-token" }),
      ).rejects.toThrow("Invalid email verification token");
    });

    it("rejects an expired token", async () => {
      emailVerificationFindUniqueMock.mockResolvedValue({
        id: 1,
        userId: 9,
        usedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        service.verifyEmail({ token: "expired-token" }),
      ).rejects.toThrow("Email verification token has expired");
    });

    it("rejects a used token", async () => {
      emailVerificationFindUniqueMock.mockResolvedValue({
        id: 1,
        userId: 9,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.verifyEmail({ token: "used-token" }),
      ).rejects.toThrow("Email verification token has already been used");
    });
  });
});
