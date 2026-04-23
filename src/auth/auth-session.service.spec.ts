import {
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";
import { AuthSessionService } from "@/auth/auth-session.service";
import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";
import { PrismaService } from "@/prisma/prisma.service";
import { AccountState } from "@/users/enums/account-state.enum";

describe("AuthSessionService", () => {
  let service: AuthSessionService;
  let moduleRef: TestingModule;

  const userFindUniqueMock = jest.fn();
  const refreshSessionFindManyMock = jest.fn();
  const refreshSessionUpdateManyMock = jest.fn();

  const prismaMock = {
    user: {
      findUnique: userFindUniqueMock,
    },
    refreshSession: {
      findMany: refreshSessionFindManyMock,
      updateMany: refreshSessionUpdateManyMock,
    },
  } as unknown as PrismaService;

  const currentUser: AuthenticatedUser = {
    id: 3,
    sessionId: 7,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    userFindUniqueMock.mockResolvedValue({
      accountState: AccountState.ACTIVE,
    });
    refreshSessionFindManyMock.mockResolvedValue([]);
    refreshSessionUpdateManyMock.mockResolvedValue({ count: 1 });

    moduleRef = await Test.createTestingModule({
      providers: [
        AuthSessionService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = moduleRef.get(AuthSessionService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it("lists only current user active sessions and marks the current session first", async () => {
    const now = new Date("2026-04-17T10:00:00.000Z");
    const older = new Date("2026-04-17T09:00:00.000Z");

    refreshSessionFindManyMock.mockResolvedValue([
      {
        id: 9,
        createdAt: older,
        lastUsedAt: now,
        expiresAt: now,
        userAgent: "Mozilla/5.0 desktop",
      },
      {
        id: 7,
        createdAt: now,
        lastUsedAt: older,
        expiresAt: now,
        userAgent: "Mozilla/5.0 current",
      },
    ]);

    const result = await service.mySessions(currentUser);

    expect(refreshSessionFindManyMock).toHaveBeenCalledWith({
      where: {
        userId: 3,
        revokedAt: null,
      },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        userAgent: true,
      },
      orderBy: [{ lastUsedAt: "desc" }, { id: "desc" }],
    });
    expect(result).toEqual([
      {
        id: 7,
        createdAt: now,
        lastUsedAt: older,
        expiresAt: now,
        userAgent: "Mozilla/5.0 current",
        isCurrent: true,
      },
      {
        id: 9,
        createdAt: older,
        lastUsedAt: now,
        expiresAt: now,
        userAgent: "Mozilla/5.0 desktop",
        isCurrent: false,
      },
    ]);
  });

  it("revokes only the current session for logoutCurrentSession", async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
    const result = await service.logoutCurrentSession(currentUser);
    const updateCalls = refreshSessionUpdateManyMock.mock.calls as Array<
      [
        {
          where?: { id?: number; userId?: number; revokedAt?: null };
          data?: { revokedAt?: Date };
        },
      ]
    >;
    const updateCall = updateCalls[0]?.[0];

    expect(updateCall?.where).toEqual({
      id: 7,
      userId: 3,
      revokedAt: null,
    });
    expect(updateCall?.data?.revokedAt).toBeInstanceOf(Date);
    expect(result).toEqual({ message: "Logged out successfully" });
    expect(loggerSpy).toHaveBeenCalledWith(
      "Revoked current session for userId=3 sessionId=7",
    );
  });

  it("revokes one selected owned session", async () => {
    const result = await service.revokeSession(currentUser, 9);
    const updateCalls = refreshSessionUpdateManyMock.mock.calls as Array<
      [
        {
          where?: { id?: number; userId?: number; revokedAt?: null };
          data?: { revokedAt?: Date };
        },
      ]
    >;
    const updateCall = updateCalls[0]?.[0];

    expect(updateCall?.where).toEqual({
      id: 9,
      userId: 3,
      revokedAt: null,
    });
    expect(updateCall?.data?.revokedAt).toBeInstanceOf(Date);
    expect(result).toEqual({ message: "Session revoked successfully" });
  });

  it("does not affect another user's session when revoking by id", async () => {
    await service.revokeSession(currentUser, 15);
    const updateCalls = refreshSessionUpdateManyMock.mock.calls as Array<
      [
        {
          where?: { id?: number; userId?: number; revokedAt?: null };
          data?: { revokedAt?: Date };
        },
      ]
    >;
    const updateCall = updateCalls[0]?.[0];

    expect(updateCall?.where).toEqual({
      id: 15,
      userId: 3,
      revokedAt: null,
    });
    expect(updateCall?.data?.revokedAt).toBeInstanceOf(Date);
  });

  it("keeps the current session active when revoking other sessions", async () => {
    const result = await service.revokeOtherSessions(currentUser);
    const updateCalls = refreshSessionUpdateManyMock.mock.calls as Array<
      [
        {
          where?: {
            userId?: number;
            revokedAt?: null;
            id?: { not?: number };
          };
          data?: { revokedAt?: Date };
        },
      ]
    >;
    const updateCall = updateCalls[0]?.[0];

    expect(updateCall?.where).toEqual({
      userId: 3,
      revokedAt: null,
      id: { not: 7 },
    });
    expect(updateCall?.data?.revokedAt).toBeInstanceOf(Date);
    expect(result).toEqual({ message: "Other sessions revoked successfully" });
  });

  it("returns generic success for revokeSession when the current session id is targeted", async () => {
    const result = await service.revokeSession(currentUser, 7);

    expect(refreshSessionUpdateManyMock).not.toHaveBeenCalled();
    expect(result).toEqual({ message: "Session revoked successfully" });
  });

  it("blocks suspended accounts from session management", async () => {
    userFindUniqueMock.mockResolvedValue({
      accountState: AccountState.SUSPENDED,
    });

    await expect(service.mySessions(currentUser)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(refreshSessionFindManyMock).not.toHaveBeenCalled();
  });

  it("blocks deactivated accounts from session management with a sanitized error code", async () => {
    userFindUniqueMock.mockResolvedValue({
      accountState: AccountState.DEACTIVATED,
    });

    await expect(service.mySessions(currentUser)).rejects.toMatchObject({
      response: {
        message: "This account is deactivated",
        code: GRAPHQL_ERROR_CODES.ACCOUNT_DEACTIVATED,
      },
    });

    expect(refreshSessionFindManyMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundException when the current user no longer exists", async () => {
    userFindUniqueMock.mockResolvedValue(null);

    await expect(service.mySessions(currentUser)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
