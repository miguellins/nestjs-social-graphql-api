import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";

import { PrismaService } from "@/prisma/prisma.service";

import { AccountState } from "@/users/enums/account-state.enum";

@Injectable()
export class FollowGuardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ensures only active accounts can perform authenticated follow operations. */
  assertActiveCurrentUser(accountState: AccountState): void {
    if (accountState === AccountState.SUSPENDED) {
      throw new UnauthorizedException({
        message: "This account is suspended",
        code: GRAPHQL_ERROR_CODES.ACCOUNT_SUSPENDED,
      });
    }

    if (accountState === AccountState.DEACTIVATED) {
      throw new UnauthorizedException({
        message: "This account is deactivated",
        code: GRAPHQL_ERROR_CODES.ACCOUNT_DEACTIVATED,
      });
    }
  }

  /** Loads and validates the current user account state for authenticated follow actions. */
  async assertActiveCurrentUserById(currentUserId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        accountState: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Current user not found");
    }

    this.assertActiveCurrentUser(user.accountState);
  }

  /** Blocks follow operations when either side has blocked the other. */
  async assertNoBlockRelationship(
    currentUserId: number,
    otherUserId: number,
    message: string,
  ): Promise<void> {
    const blockRelationship = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          {
            blockerId: currentUserId,
            blockedId: otherUserId,
          },
          {
            blockerId: otherUserId,
            blockedId: currentUserId,
          },
        ],
      },
      select: { id: true },
    });

    if (blockRelationship) {
      throw new ForbiddenException(message);
    }
  }
}
