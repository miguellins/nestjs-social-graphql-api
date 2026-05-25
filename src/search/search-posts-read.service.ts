import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";

import { MuteScope } from "@/mutes/enums/mute-scope.enum";
import { MutesService } from "@/mutes/mutes.service";

import { PostReadService } from "@/posts/post-read.service";
import {
  SafePostListSelect,
  type SafePostListDTO,
} from "@/posts/dto/safe-post-list.dto";

import {
  searchPostsCommandSchema,
  type SearchPostsCommand,
} from "@/search/schemas/search-query.schema";

import { AccountState } from "@/users/enums/account-state.enum";
import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

type SearchPostsParams = {
  first?: number;
  q: string;
};

type SearchPostIdRow = {
  id: number;
};

@Injectable()
export class SearchPostsReadService {
  private readonly logger = new Logger(SearchPostsReadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly postReadService: PostReadService,
    private readonly mutesService: MutesService,
  ) {}

  /** Searches posts by fulltext relevance, then applies viewer-aware visibility filters. */
  async searchPosts(
    input: SearchPostsParams,
    viewer?: AuthenticatedUser,
  ): Promise<SafePostListDTO[]> {
    if (viewer?.id) {
      await this.assertActiveCurrentUserById(viewer.id);
    }

    const command = this.parseSearchPostsInput(input);
    const version = await this.cacheHelper.getVersion("v:search:posts");
    const viewerKey = viewer?.id ?? "anon";
    const cacheKey = `search:posts:v${version}:q=${command.q}:viewer=${viewerKey}:first=${command.first}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => this.loadSearchPosts(command, viewer?.id),
      30_000,
    );
  }

  /** Loads ranked post ids and hydrates them through safe Prisma selects. */
  private async loadSearchPosts(
    command: SearchPostsCommand,
    viewerId?: number,
  ): Promise<SafePostListDTO[]> {
    try {
      const rawRows = await this.findRankedPostIds(command, viewerId);
      const orderedIds = rawRows.map((row) => row.id);

      if (orderedIds.length === 0) return [];

      const filters: Prisma.PostWhereInput[] = [
        { id: { in: orderedIds } },
        { removedAt: null },
        {
          author: {
            accountState: {
              not: AccountState.DEACTIVATED,
            },
          },
        },
        ...this.postReadService.buildViewerVisibilityFilters(viewerId),
        this.postReadService.buildListSurfaceSourceAvailabilityFilter(viewerId),
      ];

      if (viewerId) {
        const [blockedAuthorIds, mutedAuthorIds] = await Promise.all([
          this.postReadService.getBlockedAuthorIds(viewerId),
          this.mutesService.getMutedUserIdsForScope(viewerId, MuteScope.POSTS),
        ]);

        if (blockedAuthorIds.length > 0) {
          filters.push({ authorId: { notIn: blockedAuthorIds } });
        }

        if (mutedAuthorIds.length > 0) {
          filters.push({ authorId: { notIn: mutedAuthorIds } });
        }
      }

      const rows = await this.prisma.post.findMany({
        where: filters.length === 1 ? filters[0] : { AND: filters },
        select: SafePostListSelect,
      });

      const rowsById = new Map(rows.map((row) => [row.id, row]));
      const orderedRows = orderedIds
        .map((id) => rowsById.get(id))
        .filter((row): row is (typeof rows)[number] => row !== undefined);

      return this.postReadService.projectPostListRows(orderedRows, viewerId);
    } catch (err) {
      this.throwUnexpectedPersistenceFailure(err);
    }
  }

  /** Runs the bounded MySQL fulltext relevance query for candidate post ids. */
  private async findRankedPostIds(
    command: SearchPostsCommand,
    viewerId?: number,
  ): Promise<SearchPostIdRow[]> {
    const anonymousVisibility = viewerId
      ? Prisma.empty
      : Prisma.sql`AND u.privacySetting = ${UserPrivacySetting.PUBLIC}`;

    return this.prisma.$queryRaw<SearchPostIdRow[]>(Prisma.sql`
      SELECT p.id
      FROM Post p
      INNER JOIN User u ON u.id = p.authorId
      WHERE MATCH(p.title, p.content) AGAINST (${command.q} IN BOOLEAN MODE)
        AND p.removedAt IS NULL
        AND u.accountState <> ${AccountState.DEACTIVATED}
        ${anonymousVisibility}
      ORDER BY MATCH(p.title, p.content) AGAINST (${command.q} IN BOOLEAN MODE) DESC,
        p.createdAt DESC,
        p.id DESC
      LIMIT ${command.first}
    `);
  }

  /** Parses and normalizes post search input. */
  private parseSearchPostsInput(input: SearchPostsParams): SearchPostsCommand {
    return parseWithBadRequest(
      searchPostsCommandSchema,
      input,
      "Invalid post search input",
    );
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
      "Unexpected persistence failure while trying to search posts",
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException("Failed to search posts");
  }
}
