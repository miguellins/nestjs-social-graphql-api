import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";

import { PrismaService } from "@/prisma/prisma.service";

import { AccountState } from "@/users/enums/account-state.enum";

@Injectable()
export class CommentGuardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Enforces active-account status for authenticated comment operations. */
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

    if (user.accountState === AccountState.SUSPENDED) {
      throw new UnauthorizedException({
        message: "This account is suspended",
        code: GRAPHQL_ERROR_CODES.ACCOUNT_SUSPENDED,
      });
    }

    if (user.accountState === AccountState.DEACTIVATED) {
      throw new UnauthorizedException({
        message: "This account is deactivated",
        code: GRAPHQL_ERROR_CODES.ACCOUNT_DEACTIVATED,
      });
    }
  }
}
