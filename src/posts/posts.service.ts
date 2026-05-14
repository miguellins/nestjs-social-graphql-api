import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { decodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";
import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import {
  buildChronologicalCursorFilter,
  buildCursorPage,
  normalizeCursorTake,
  type CursorPageResult,
} from "@/common/pagination/cursor-pagination";

import { type SafePostDetailDTO } from "@/posts/dto/safe-post-detail.dto";
import { PostReadService } from "@/posts/post-read.service";
import {
  createPostCommandSchema,
  updatePostCommandSchema,
  type CreatePostCommand,
  type UpdatePostCommand,
} from "@/posts/schemas/post-write.schema";
import {
  removePostByModeratorCommandSchema,
  type RemovePostByModeratorCommand,
} from "@/posts/schemas/remove-post-by-moderator.schema";
import {
  type CreatedPostDTO,
  CreatedPostSelect,
} from "@/posts/dto/created-post.dto";
import {
  type SafePostListDTO,
  SafePostListSelect,
} from "@/posts/dto/safe-post-list.dto";

import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { MODERATION_ROLE_SET } from "@/users/enums/user-role.enum";
import { AccountState } from "@/users/enums/account-state.enum";
import {
  getUserByUsernameCommandSchema,
  type GetUserByUsernameCommand,
} from "@/users/schemas/user-read.schema";

import { HOME_FEED_POST_FANOUT_EVENT } from "@/outbox/events/home-feed-post-fanout.event";
import { OutboxService } from "@/outbox/outbox.service";

import { MentionsService } from "@/mentions/mentions.service";

import {
  HashtagsService,
  type HashtagSyncResult,
} from "@/hashtags/hashtags.service";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { MutesService } from "@/mutes/mutes.service";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

type PaginationParams = {
  after?: string;
  first?: number;
  take?: number;
  orderBy?: ChronologicalOrder;
};

type FindPostsParams = PaginationParams & {
  q?: string;
};

const POST_DETAIL_CACHE_TTL_MS = 60_000;

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);
  private readonly feedProjectionEnqueueEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly postReadService: PostReadService,
    private readonly mutesService: MutesService,
    private readonly mentionsService: MentionsService,
    private readonly hashtagsService: HashtagsService,
    private readonly outboxService: OutboxService,
    configService: ConfigService,
  ) {
    this.feedProjectionEnqueueEnabled =
      configService.get<boolean>("FEED_PROJECTION_ENQUEUE_ENABLED") ?? false;
  }

  async myFeed(
    currentUserId: number,
    params?: PaginationParams,
  ): Promise<CursorPageResult<SafePostListDTO>> {
    await this.assertActiveCurrentUserById(currentUserId);
    return this.postReadService.getMyFeed(currentUserId, params);
  }

  async findPosts(
    params?: FindPostsParams,
    viewer?: AuthenticatedUser,
  ): Promise<CursorPageResult<SafePostListDTO>> {
    if (viewer?.id) {
      await this.assertActiveCurrentUserById(viewer.id);
    }

    const take = normalizeCursorTake(params?.first);

    const search = params?.q?.trim().toLowerCase() || undefined;
    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderby);

    if (viewer?.id) {
      const blockedAuthorIds = await this.postReadService.getBlockedAuthorIds(
        viewer.id,
      );
      const mutedAuthorIds = await this.mutesService.getMutedUserIds(viewer.id);
      const filters: Prisma.PostWhereInput[] = [
        {
          removedAt: null,
        },
        {
          author: {
            accountState: {
              not: AccountState.DEACTIVATED,
            },
          },
        },
        ...this.postReadService.buildViewerVisibilityFilters(viewer.id),
      ];

      if (blockedAuthorIds.length > 0) {
        filters.push({
          authorId: {
            notIn: blockedAuthorIds,
          },
        });
      }

      if (mutedAuthorIds.length > 0) {
        filters.push({
          authorId: {
            notIn: mutedAuthorIds,
          },
        });
      }

      if (search) {
        filters.push({
          OR: [
            { title: { contains: search } },
            { content: { contains: search } },
          ],
        });
      }

      if (cursorFilter) {
        filters.push(cursorFilter);
      }

      const rows = await this.prisma.post.findMany({
        take: take + 1,
        where: filters.length === 1 ? filters[0] : { AND: filters },
        orderBy: [
          { createdAt: toSortDirection(orderby) },
          { id: toSortDirection(orderby) },
        ],
        select: SafePostListSelect,
      });

      return buildCursorPage(rows, take);
    }

    const v = await this.cacheHelper.getVersion("v:posts:list");
    const cacheKey = `posts:list:v${v}:first=${take}:after=${params?.after ?? "none"}:q=${search ?? "all"}:order=${orderby}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const filters: Prisma.PostWhereInput[] = [];

        filters.push({
          removedAt: null,
        });
        filters.push({
          author: {
            privacySetting: UserPrivacySetting.PUBLIC,
            accountState: {
              not: AccountState.DEACTIVATED,
            },
          },
        });

        if (search) {
          filters.push({
            OR: [
              { title: { contains: search } },
              { content: { contains: search } },
            ],
          });
        }

        if (cursorFilter) {
          filters.push(cursorFilter);
        }

        const where =
          filters.length === 0
            ? undefined
            : filters.length === 1
              ? filters[0]
              : { AND: filters };

        const rows = await this.prisma.post.findMany({
          take: take + 1,

          where,

          orderBy: [
            { createdAt: toSortDirection(orderby) },
            { id: toSortDirection(orderby) },
          ],

          select: SafePostListSelect,
        });

        return buildCursorPage(rows, take);
      },
      30_000,
    );
  }

  async findPostsByUsername(
    username: string,
    params?: PaginationParams,
    viewer?: AuthenticatedUser,
  ): Promise<CursorPageResult<SafePostListDTO>> {
    if (viewer?.id) {
      await this.assertActiveCurrentUserById(viewer.id);
    }

    const normalized = this.parseGetUserByUsernameInput({ username });

    const take = normalizeCursorTake(
      "first" in (params ?? {}) ? params?.first : undefined,
    );

    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const after =
      "after" in (params ?? {}) && typeof params?.after === "string"
        ? params.after
        : undefined;
    const cursor = after ? decodeChronoCursor(after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderby);

    const author = await this.prisma.user.findUnique({
      where: { username: normalized.username },
      select: {
        id: true,
        privacySetting: true,
        accountState: true,
      },
    });

    if (!author || author.accountState === AccountState.DEACTIVATED) {
      throw new NotFoundException("User not found");
    }

    if (!(await this.canViewerReadAuthorContent(viewer?.id, author))) {
      throw new NotFoundException("User not found");
    }

    const authorId = author.id;

    const versionKey = this.getUserPostsListVersionKey(authorId);
    const v = await this.cacheHelper.getVersion(versionKey);
    const cacheKey = `user:${authorId}:posts:list:v${v}:first=${take}:after=${after ?? "none"}:order=${orderby}`;

    if (viewer?.id || author.privacySetting === UserPrivacySetting.PRIVATE) {
      const rows = await this.prisma.post.findMany({
        take: take + 1,
        where: cursorFilter
          ? {
              AND: [{ authorId }, { removedAt: null }, cursorFilter],
            }
          : {
              authorId,
              removedAt: null,
            },
        orderBy: [
          { createdAt: toSortDirection(orderby) },
          { id: toSortDirection(orderby) },
        ],
        select: SafePostListSelect,
      });

      return buildCursorPage(rows, take);
    }

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.prisma.post.findMany({
          take: take + 1,
          where: cursorFilter
            ? {
                AND: [{ authorId }, { removedAt: null }, cursorFilter],
              }
            : {
                authorId,
                removedAt: null,
              },

          orderBy: [
            { createdAt: toSortDirection(orderby) },
            { id: toSortDirection(orderby) },
          ],

          select: SafePostListSelect,
        });

        return buildCursorPage(rows, take);
      },
      30_000,
    );
  }

  async getPost(
    id: number,
    viewer?: AuthenticatedUser,
  ): Promise<SafePostDetailDTO> {
    if (viewer?.id) {
      await this.assertActiveCurrentUserById(viewer.id);
    }

    if (viewer?.id) {
      return this.postReadService.getPostDetail(id, viewer.id);
    }

    const cacheKey = `posts:detail:${id}`;

    const post = await this.cacheHelper.getOrSet(
      cacheKey,
      async () => this.postReadService.getPostDetail(id),
      POST_DETAIL_CACHE_TTL_MS,
    );

    void runBestEffort(
      this.logger,
      "warn",
      `Failed to update viewsCount asynchronously for post ${id}`,
      async () => {
        await this.incrementPostViewsCount(
          id,
          cacheKey,
          POST_DETAIL_CACHE_TTL_MS,
        );
      },
    );

    return post;
  }

  async createPost(
    input: CreatePostCommand,
    currentUserId: number,
  ): Promise<CreatedPostDTO> {
    await this.assertActiveCurrentUserById(currentUserId);
    const data = this.parseCreatePostInput(input);
    this.mentionsService.validatePostContentMentions(data.content);
    this.hashtagsService.validatePostContentHashtags(data.content);

    let post: CreatedPostDTO;
    let hashtagSync: HashtagSyncResult = {
      changed: false,
      publicCountChanged: false,
    };

    try {
      const createData: Prisma.PostCreateInput = {
        content: data.content,
        author: { connect: { id: currentUserId } },
      };

      if (data.title !== undefined) {
        createData.title = data.title;
      }

      post = await this.prisma.$transaction(async (tx) => {
        const created = await tx.post.create({
          data: createData,
          select: CreatedPostSelect,
        });
        const author = await tx.user.findUnique({
          where: { id: currentUserId },
          select: {
            accountState: true,
            privacySetting: true,
          },
        });

        if (!author) {
          throw new NotFoundException("Author not found");
        }

        hashtagSync = await this.hashtagsService.replacePostHashtags({
          tx,
          postId: created.id,
          content: data.content,
          postCreatedAt: created.createdAt,
          publiclyCountable: this.hashtagsService.isPubliclyCountablePost({
            removedAt: null,
            author,
          }),
        });

        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2003" || err.code === "P2025") {
          throw new NotFoundException("Author not found");
        }
      }

      this.throwUnexpectedPersistenceFailure("create post", err);
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after creating post ${post.id}`,
      async () => {
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          this.getUserPostsListVersionKey(currentUserId),
        );
        if (hashtagSync.publicCountChanged) {
          await this.cacheHelper.bumpVersion("v:hashtags:list");
        }
        await this.cacheHelper.del(`user:safe:${currentUserId}`);
        await this.cacheHelper.bumpVersion("v:user:list");
      },
    );

    await runBestEffort(
      this.logger,
      "error",
      `Failed to sync mentions after creating post ${post.id}`,
      async () => {
        await this.mentionsService.syncPostMentions({
          postId: post.id,
          actorId: currentUserId,
          content: data.content,
        });
      },
    );

    if (this.feedProjectionEnqueueEnabled) {
      await runBestEffort(
        this.logger,
        "error",
        `Failed to enqueue home feed fanout for post ${post.id}`,
        async () => {
          await this.outboxService.enqueue({
            eventType: HOME_FEED_POST_FANOUT_EVENT,
            aggregateType: "post",
            aggregateId: post.id,
            payload: {
              postId: post.id,
              authorId: currentUserId,
              postCreatedAt: post.createdAt.toISOString(),
              reason: "FOLLOWING_POST",
            },
          });
        },
      );
    }

    return post;
  }

  async updatePost(
    id: number,
    input: UpdatePostCommand,
    currentUserId: number,
  ): Promise<SafePostListDTO> {
    await this.assertActiveCurrentUserById(currentUserId);
    const normalizedInput = this.parseUpdatePostInput(input);

    const data: Prisma.PostUpdateInput = {};

    if (normalizedInput.title !== undefined) {
      data.title = normalizedInput.title;
    }

    if (normalizedInput.content !== undefined) {
      data.content = normalizedInput.content;
    }

    let post: SafePostListDTO;
    let finalContentForMentions: string | undefined;
    let hashtagSync: HashtagSyncResult = {
      changed: false,
      publicCountChanged: false,
    };

    try {
      const existing = await this.prisma.post.findUnique({
        where: { id },

        select: {
          id: true,
          authorId: true,
          title: true,
          content: true,
          createdAt: true,
          removedAt: true,
          author: {
            select: {
              accountState: true,
              privacySetting: true,
            },
          },
        },
      });

      if (!existing || existing.removedAt) {
        throw new NotFoundException("Post not found");
      }

      if (existing.authorId !== currentUserId) {
        throw new ForbiddenException(
          "You do not have permission to update this post",
        );
      }

      if (this.didPostContentChange(existing, normalizedInput)) {
        data.editedAt = new Date();
        finalContentForMentions = normalizedInput.content;
      }

      if (finalContentForMentions !== undefined) {
        this.mentionsService.validatePostContentMentions(
          finalContentForMentions,
        );
        this.hashtagsService.validatePostContentHashtags(
          finalContentForMentions,
        );
      }

      post = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.post.update({
          where: { id },
          data,
          select: SafePostListSelect,
        });

        if (finalContentForMentions !== undefined) {
          hashtagSync = await this.hashtagsService.replacePostHashtags({
            tx,
            postId: id,
            content: finalContentForMentions,
            postCreatedAt: existing.createdAt,
            publiclyCountable:
              this.hashtagsService.isPubliclyCountablePost(existing),
          });
        }

        return updated;
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;

      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") throw new NotFoundException("Post not found");
      }

      this.throwUnexpectedPersistenceFailure("update post", err);
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after updating post ${id}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${id}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          this.getUserPostsListVersionKey(currentUserId),
        );
        if (hashtagSync.publicCountChanged) {
          await this.cacheHelper.bumpVersion("v:hashtags:list");
        }
      },
    );

    if (finalContentForMentions !== undefined) {
      await runBestEffort(
        this.logger,
        "error",
        `Failed to sync mentions after updating post ${id}`,
        async () => {
          await this.mentionsService.syncPostMentions({
            postId: id,
            actorId: currentUserId,
            content: finalContentForMentions,
          });
        },
      );
    }

    return post;
  }

  async deletePost(
    id: number,
    currentUserId: number,
  ): Promise<MessageResponse> {
    await this.assertActiveCurrentUserById(currentUserId);
    let hashtagSync: HashtagSyncResult = {
      changed: false,
      publicCountChanged: false,
    };

    try {
      const existing = await this.prisma.post.findUnique({
        where: { id },
        select: {
          id: true,
          authorId: true,
          removedAt: true,
          author: {
            select: {
              accountState: true,
              privacySetting: true,
            },
          },
        },
      });

      if (!existing || existing.removedAt) {
        throw new NotFoundException("Post not found");
      }

      if (existing.authorId !== currentUserId) {
        throw new ForbiddenException(
          "You do not have permission to delete this post",
        );
      }

      await this.prisma.$transaction(async (tx) => {
        hashtagSync = await this.hashtagsService.stripPostHashtags({
          tx,
          postId: id,
          publiclyCountable:
            this.hashtagsService.isPubliclyCountablePost(existing),
        });

        await tx.post.delete({
          where: { id },
        });
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;

      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        throw new NotFoundException("Post not found");
      }

      this.throwUnexpectedPersistenceFailure("delete post", err);
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after deleting post ${id}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${id}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          this.getUserPostsListVersionKey(currentUserId),
        );
        if (hashtagSync.publicCountChanged) {
          await this.cacheHelper.bumpVersion("v:hashtags:list");
        }
      },
    );

    return {
      message: "Post deleted successfully",
    };
  }

  async removePostByModerator(
    input: RemovePostByModeratorCommand,
    currentUser: AuthenticatedUser,
  ): Promise<MessageResponse> {
    await this.assertActiveCurrentUserById(currentUser.id);
    this.assertCanModerateContent(currentUser);

    const data = this.parseRemovePostByModeratorInput(input);

    const existing = await this.prisma.post.findUnique({
      where: { id: data.postId },
      select: {
        id: true,
        authorId: true,
        removedAt: true,
        author: {
          select: {
            accountState: true,
            privacySetting: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException("Post not found");
    }

    if (existing.removedAt) {
      throw new BadRequestException("Post has already been removed");
    }

    let hashtagSync: HashtagSyncResult = {
      changed: false,
      publicCountChanged: false,
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        const removal = await tx.post.updateMany({
          where: {
            id: data.postId,
            removedAt: null,
          },
          data: {
            removedAt: new Date(),
            removedById: currentUser.id,
            removalReason: data.reason,
          },
        });

        if (removal.count === 0) {
          throw new BadRequestException("Post has already been removed");
        }

        hashtagSync = await this.hashtagsService.stripPostHashtags({
          tx,
          postId: data.postId,
          publiclyCountable:
            this.hashtagsService.isPubliclyCountablePost(existing),
        });

        if (data.reportId !== undefined) {
          const linkedReport = await tx.contentReport.updateMany({
            where: {
              id: data.reportId,
              postId: data.postId,
              status: "OPEN",
            },
            data: {
              status: "ACTIONED",
            },
          });

          if (linkedReport.count === 0) {
            throw new BadRequestException(
              "Linked report is not open for this post",
            );
          }
        }

        await tx.moderationAction.create({
          data: {
            actorId: currentUser.id,
            actionType: "REMOVE_POST",
            targetType: "POST",
            targetId: data.postId,
            reason: data.reason,
            reportId: data.reportId,
            postId: data.postId,
          },
        });
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;

      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        throw new NotFoundException("Post not found");
      }

      this.throwUnexpectedPersistenceFailure("remove post by moderator", err);
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after moderator removed post ${data.postId}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${data.postId}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          this.getUserPostsListVersionKey(existing.authorId),
        );
        if (hashtagSync.publicCountChanged) {
          await this.cacheHelper.bumpVersion("v:hashtags:list");
        }
      },
    );

    return {
      message: "Post removed successfully",
    };
  }

  // Private Helpers
  // Parses and normalizes create-post input
  private parseCreatePostInput(input: CreatePostCommand) {
    return parseWithBadRequest(
      createPostCommandSchema,
      input,
      "Invalid post input",
    );
  }

  // Parses and normalizes update-post input
  private parseUpdatePostInput(input: UpdatePostCommand) {
    return parseWithBadRequest(
      updatePostCommandSchema,
      input,
      "Invalid post input",
    );
  }

  // Parses and normalizes moderator/admin post-removal input
  private parseRemovePostByModeratorInput(input: RemovePostByModeratorCommand) {
    return parseWithBadRequest(
      removePostByModeratorCommandSchema,
      input,
      "Invalid moderator post removal input",
    );
  }

  // Parses and normalizes public username lookup input
  private parseGetUserByUsernameInput(input: GetUserByUsernameCommand) {
    return parseWithBadRequest(
      getUserByUsernameCommandSchema,
      input,
      "Invalid post author lookup input",
    );
  }

  // Returns the cache version key string for a user's post list
  private getUserPostsListVersionKey(userId: number): string {
    return `v:user:${userId}:posts:list`;
  }

  // Increments the persisted view counter and refreshes the cached detail when present
  private async incrementPostViewsCount(
    id: number,
    cacheKey: string,
    detailCacheTtlMs: number,
  ): Promise<void> {
    let updatedPost: { viewsCount: number };

    try {
      updatedPost = await this.prisma.post.update({
        where: { id },
        data: {
          viewsCount: {
            increment: 1,
          },
        },
        select: {
          viewsCount: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        return;
      }

      throw err;
    }

    const cachedPost = await this.cacheHelper.get<SafePostDetailDTO>(cacheKey);

    if (!cachedPost) {
      return;
    }

    await this.cacheHelper.set(
      cacheKey,
      {
        ...cachedPost,
        viewsCount: updatedPost.viewsCount,
      },
      detailCacheTtlMs,
    );
  }

  // Enforces that only moderators/admins can perform moderation actions
  private assertCanModerateContent(user: AuthenticatedUser): void {
    if (!user.role || !MODERATION_ROLE_SET.has(user.role)) {
      throw new ForbiddenException(
        "You do not have permission to moderate content",
      );
    }
  }

  // Determines if the provided input would result in a content change for a given post
  private didPostContentChange(
    existing: {
      title: string | null;
      content: string;
    },
    input: UpdatePostCommand,
  ): boolean {
    return (
      (input.title !== undefined && input.title !== existing.title) ||
      (input.content !== undefined && input.content !== existing.content)
    );
  }

  // Logs and throws an internal server error for unexpected persistence failures
  private throwUnexpectedPersistenceFailure(
    action:
      | "create post"
      | "update post"
      | "delete post"
      | "remove post by moderator",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  // Checks whether the viewer can read one author's content under privacy/account-state rules
  private async canViewerReadAuthorContent(
    viewerId: number | undefined,
    author: {
      id: number;
      privacySetting: UserPrivacySetting;
      accountState: AccountState;
    },
  ): Promise<boolean> {
    if (author.accountState === AccountState.DEACTIVATED) {
      return false;
    }

    if (viewerId === author.id) {
      return true;
    }

    if (!viewerId) {
      return author.privacySetting === UserPrivacySetting.PUBLIC;
    }

    const blockRelationship = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          {
            blockerId: viewerId,
            blockedId: author.id,
          },
          {
            blockerId: author.id,
            blockedId: viewerId,
          },
        ],
      },
      select: { id: true },
    });

    if (blockRelationship) {
      return false;
    }

    if (await this.mutesService.isMuted(viewerId, author.id)) {
      return false;
    }

    if (author.privacySetting === UserPrivacySetting.PUBLIC) {
      return true;
    }

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewerId,
          followingId: author.id,
        },
      },
      select: { id: true },
    });

    return Boolean(follow);
  }

  // Ensures authenticated post operations cannot be performed by disabled accounts
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
}
