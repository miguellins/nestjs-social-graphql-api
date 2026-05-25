import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";

import { SafeUserSelect, type SafeUserDTO } from "@/users/dto/safe-user.dto";
import { AccountState } from "@/users/enums/account-state.enum";

import { PostReadService } from "@/posts/post-read.service";

import { PrismaService } from "@/prisma/prisma.service";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { Prisma } from "@prisma/client";

import {
  searchUsersCommandSchema,
  type SearchUsersCommand,
} from "@/search/schemas/search-query.schema";

type SearchUsersParams = {
  first?: number;
  q: string;
};

type SearchUserIdRow = {
  id: number;
};

type SafeUserSearchRecord = Omit<SafeUserDTO, "avatarUrl"> & {
  avatarMedia?: unknown;
};

@Injectable()
export class SearchUsersReadService {
  private readonly logger = new Logger(SearchUsersReadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly postReadService: PostReadService,
  ) {}

  /** Searches active users by public identity fields and applies mutual-block filtering. */
  async searchUsers(
    input: SearchUsersParams,
    viewer?: AuthenticatedUser,
  ): Promise<SafeUserDTO[]> {
    if (viewer?.id) {
      await this.assertActiveCurrentUserById(viewer.id);
    }

    const command = this.parseSearchUsersInput(input);
    const version = await this.cacheHelper.getVersion("v:search:users");
    const viewerKey = viewer?.id ?? "anon";
    const cacheKey = `search:users:v${version}:q=${command.q}:viewer=${viewerKey}:first=${command.first}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => this.loadSearchUsers(command, viewer?.id),
      60_000,
    );
  }

  /** Loads ranked user ids, drops blocked users, and hydrates safe public user rows. */
  private async loadSearchUsers(
    command: SearchUsersCommand,
    viewerId?: number,
  ): Promise<SafeUserDTO[]> {
    try {
      const rawRows = await this.findRankedUserIds(command);
      let orderedIds = rawRows.map((row) => row.id);

      if (orderedIds.length === 0) return [];

      if (viewerId) {
        const blockedUserIds =
          await this.postReadService.getBlockedAuthorIds(viewerId);
        const blockedSet = new Set(blockedUserIds);
        orderedIds = orderedIds.filter((id) => !blockedSet.has(id));
      }

      if (orderedIds.length === 0) return [];

      const rows = await this.prisma.user.findMany({
        where: {
          id: { in: orderedIds },
          accountState: AccountState.ACTIVE,
        },
        select: SafeUserSelect,
      });

      const rowsById = new Map(rows.map((row) => [row.id, row]));

      return orderedIds
        .map((id) => rowsById.get(id))
        .filter((row): row is (typeof rows)[number] => row !== undefined)
        .map((row) => this.toSafeUserSearchResult(row as SafeUserSearchRecord));
    } catch (err) {
      this.throwUnexpectedPersistenceFailure(err);
    }
  }

  /** Runs the bounded MySQL fulltext and username-prefix query for candidate user ids. */
  private async findRankedUserIds(
    command: SearchUsersCommand,
  ): Promise<SearchUserIdRow[]> {
    const usernamePrefix = this.getUsernamePrefix(command.q);
    const booleanQuery = this.buildBooleanPrefixQuery(command.q);

    return this.prisma.$queryRaw<SearchUserIdRow[]>(Prisma.sql`
      SELECT u.id
      FROM User u
      WHERE u.accountState = ${AccountState.ACTIVE}
        AND (
          u.username LIKE ${`${usernamePrefix}%`}
          OR MATCH(u.username, u.name) AGAINST (${booleanQuery} IN BOOLEAN MODE)
        )
      ORDER BY CASE WHEN u.username LIKE ${`${usernamePrefix}%`} THEN 1 ELSE 0 END DESC,
        MATCH(u.username, u.name) AGAINST (${command.q}) DESC,
        u.username ASC
      LIMIT ${command.first}
    `);
  }

  /** Parses and normalizes user search input. */
  private parseSearchUsersInput(input: SearchUsersParams): SearchUsersCommand {
    return parseWithBadRequest(
      searchUsersCommandSchema,
      input,
      "Invalid user search input",
    );
  }

  /** Returns the username-prefix candidate from a normalized user query. */
  private getUsernamePrefix(query: string): string {
    return query.split(/\s+/)[0] ?? query;
  }

  /** Builds a safe boolean prefix query without exposing raw FULLTEXT operators. */
  private buildBooleanPrefixQuery(query: string): string {
    return query
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .map((term) => `${term}*`)
      .join(" ");
  }

  /** Projects a SafeUserSelect row into the public SafeUser GraphQL shape. */
  private toSafeUserSearchResult(user: SafeUserSearchRecord): SafeUserDTO {
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      bio: user.bio,
      websiteUrl: user.websiteUrl,
      location: user.location,
      privacySetting: user.privacySetting,
      accountState: user.accountState,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      _count: user._count,
    };
  }

  /** Enforces that authenticated search reads come only from active accounts. */
  private async assertActiveCurrentUserById(
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

    if (user.accountState === AccountState.SUSPENDED) {
      throw new ForbiddenException("This account is suspended");
    }

    if (user.accountState === AccountState.DEACTIVATED) {
      throw new NotFoundException("Current user not found");
    }
  }

  /** Logs unexpected search persistence failures and throws a sanitized error. */
  private throwUnexpectedPersistenceFailure(err: unknown): never {
    this.logger.error(
      "Unexpected persistence failure while trying to search users",
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException("Failed to search users");
  }
}
