import {
  NotFoundException,
  UnauthorizedException,
  Injectable,
} from "@nestjs/common";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";
import { SessionInfo } from "@/auth/models/session-info.model";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";
import { MessageResponse } from "@/common/types/message-response.type";

import { PrismaService } from "@/prisma/prisma.service";

import { AccountState } from "@/users/enums/account-state.enum";

type SessionRow = {
  id: number;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  userAgent: string | null;
};

@Injectable()
export class AuthSessionService {
  private static readonly ACCOUNT_SUSPENDED_MESSAGE =
    "This account is suspended";
  private static readonly ACCOUNT_DEACTIVATED_MESSAGE =
    "This account is deactivated";
  private static readonly LOGOUT_SUCCESS_MESSAGE = "Logged out successfully";
  private static readonly REVOKE_SESSION_SUCCESS_MESSAGE =
    "Session revoked successfully";
  private static readonly REVOKE_OTHER_SESSIONS_SUCCESS_MESSAGE =
    "Other sessions revoked successfully";

  constructor(private readonly prisma: PrismaService) {}

  async mySessions(currentUser: AuthenticatedUser): Promise<SessionInfo[]> {
    await this.assertCanUseAuthenticatedAuthFlow(currentUser.id);

    const sessions = await this.prisma.refreshSession.findMany({
      where: {
        userId: currentUser.id,
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

    return this.sortSessions(sessions, currentUser.sessionId).map(
      (session) => ({
        id: session.id,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
        userAgent: session.userAgent,
        isCurrent: session.id === currentUser.sessionId,
      }),
    );
  }

  async logoutCurrentSession(
    currentUser: AuthenticatedUser,
  ): Promise<MessageResponse> {
    await this.assertCanUseAuthenticatedAuthFlow(currentUser.id);

    if (currentUser.sessionId) {
      await this.prisma.refreshSession.updateMany({
        where: {
          id: currentUser.sessionId,
          userId: currentUser.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    return { message: AuthSessionService.LOGOUT_SUCCESS_MESSAGE };
  }

  async revokeSession(
    currentUser: AuthenticatedUser,
    sessionId: number,
  ): Promise<MessageResponse> {
    await this.assertCanUseAuthenticatedAuthFlow(currentUser.id);

    if (currentUser.sessionId && sessionId !== currentUser.sessionId) {
      await this.prisma.refreshSession.updateMany({
        where: {
          id: sessionId,
          userId: currentUser.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    return { message: AuthSessionService.REVOKE_SESSION_SUCCESS_MESSAGE };
  }

  async revokeOtherSessions(
    currentUser: AuthenticatedUser,
  ): Promise<MessageResponse> {
    await this.assertCanUseAuthenticatedAuthFlow(currentUser.id);

    if (currentUser.sessionId) {
      await this.prisma.refreshSession.updateMany({
        where: {
          userId: currentUser.id,
          revokedAt: null,
          id: { not: currentUser.sessionId },
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    return {
      message: AuthSessionService.REVOKE_OTHER_SESSIONS_SUCCESS_MESSAGE,
    };
  }

  private sortSessions(
    sessions: SessionRow[],
    currentSessionId?: number,
  ): SessionRow[] {
    if (!currentSessionId) return sessions;

    return [...sessions].sort((left, right) => {
      if (left.id === currentSessionId && right.id !== currentSessionId) {
        return -1;
      }

      if (right.id === currentSessionId && left.id !== currentSessionId) {
        return 1;
      }

      return right.lastUsedAt.getTime() - left.lastUsedAt.getTime();
    });
  }

  private async assertCanUseAuthenticatedAuthFlow(
    currentUserId: number,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        accountState: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Current user not found");
    }

    this.assertCanAuthenticate(user.accountState);
  }

  private assertCanAuthenticate(accountState: AccountState): void {
    if (accountState === AccountState.SUSPENDED) {
      throw new UnauthorizedException({
        message: AuthSessionService.ACCOUNT_SUSPENDED_MESSAGE,
        code: GRAPHQL_ERROR_CODES.ACCOUNT_SUSPENDED,
      });
    }

    if (accountState === AccountState.DEACTIVATED) {
      throw new UnauthorizedException({
        message: AuthSessionService.ACCOUNT_DEACTIVATED_MESSAGE,
        code: GRAPHQL_ERROR_CODES.ACCOUNT_DEACTIVATED,
      });
    }
  }
}
