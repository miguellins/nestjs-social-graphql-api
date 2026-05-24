import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";
import { MessageResponse } from "@/common/types/message-response.type";
import { runBestEffort } from "@/common/errors/run-best-effort";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";

import { PostCacheService } from "@/posts/post-cache.service";
import { PostReadService } from "@/posts/post-read.service";
import {
  CreatedPostSelect,
  type CreatedPostDTO,
} from "@/posts/dto/created-post.dto";

import { HOME_FEED_POST_FANOUT_EVENT } from "@/outbox/events/home-feed-post-fanout.event";
import { OutboxService } from "@/outbox/outbox.service";

import { MentionsService } from "@/mentions/mentions.service";
import {
  HashtagsService,
  type HashtagSyncResult,
} from "@/hashtags/hashtags.service";

import { NotificationTriggerService } from "@/notifications/notification-trigger.service";

import { MutesService } from "@/mutes/mutes.service";
import { MuteScope } from "@/mutes/enums/mute-scope.enum";

import { AccountState } from "@/users/enums/account-state.enum";

import {
  quotePostCommandSchema,
  type QuotePostCommand,
} from "@/reposts/schemas/repost-write.schema";
import type { RepostPostPayload } from "@/reposts/models/repost-post-payload.model";

import { PrismaService } from "@/prisma/prisma.service";
import { PostKind, Prisma } from "@prisma/client";

type RootSourcePost = {
  id: number;
  authorId: number;
  repostsCount: number;
};

@Injectable()
export class RepostWriteService {
  private readonly logger = new Logger(RepostWriteService.name);
  private readonly feedProjectionEnqueueEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly postReadService: PostReadService,
    private readonly postCacheService: PostCacheService,
    private readonly mentionsService: MentionsService,
    private readonly hashtagsService: HashtagsService,
    private readonly mutesService: MutesService,
    private readonly outboxService: OutboxService,
    private readonly notificationTrigger: NotificationTriggerService,
    configService: ConfigService,
  ) {
    this.feedProjectionEnqueueEnabled =
      configService.get<boolean>("FEED_PROJECTION_ENQUEUE_ENABLED") ?? false;
  }

  /** Creates one repost wrapper for a visible root source post. */
  async repostPost(
    currentUserId: number,
    postId: number,
  ): Promise<RepostPostPayload> {
    await this.assertActiveCurrentUserById(currentUserId);
    const source = await this.getVisibleRootSourcePost(currentUserId, postId);

    if (source.authorId === currentUserId) {
      throw new ForbiddenException("You cannot repost your own post");
    }

    let repostPostId: number;
    let repostsCount: number;
    let postCreatedAt: Date;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const duplicate = await tx.post.findFirst({
          where: {
            authorId: currentUserId,
            kind: PostKind.REPOST,
            sourcePostId: source.id,
            removedAt: null,
          },
          select: { id: true },
        });

        if (duplicate) {
          throw new ConflictException("You already reposted this post");
        }

        const updatedSource = await tx.post.update({
          where: { id: source.id },
          data: { repostsCount: { increment: 1 } },
          select: { repostsCount: true },
        });

        const created = await tx.post.create({
          data: {
            kind: PostKind.REPOST,
            content: "",
            author: { connect: { id: currentUserId } },
            sourcePost: { connect: { id: source.id } },
          },
          select: { id: true, createdAt: true },
        });

        return {
          repostPostId: created.id,
          postCreatedAt: created.createdAt,
          repostsCount: updatedSource.repostsCount,
        };
      });

      repostPostId = result.repostPostId;
      repostsCount = result.repostsCount;
      postCreatedAt = result.postCreatedAt;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.throwUnexpectedPersistenceFailure("repost post", err);
    }

    await this.postCacheService.invalidateAfterRepostChange(
      source.id,
      currentUserId,
      source.authorId,
      repostPostId,
    );
    await this.enqueueHomeFeedFanout(
      repostPostId,
      currentUserId,
      postCreatedAt,
    );
    await this.notifyPostReposted(source.authorId, currentUserId, source.id);

    return { repostPostId, sourcePostId: source.id, repostsCount };
  }

  /** Deletes the viewer's repost wrapper for a root source post and decrements the source counter. */
  async undoRepost(
    currentUserId: number,
    postId: number,
  ): Promise<MessageResponse> {
    await this.assertActiveCurrentUserById(currentUserId);
    const source = await this.resolveRootSourcePost(postId);

    if (!source) {
      throw new NotFoundException("Post not found");
    }

    let repostPostId: number | undefined;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const repost = await tx.post.findFirst({
          where: {
            authorId: currentUserId,
            kind: PostKind.REPOST,
            sourcePostId: source.id,
          },
          select: { id: true },
        });

        if (!repost) return undefined;

        await tx.post.delete({ where: { id: repost.id } });
        await tx.post.update({
          where: { id: source.id },
          data: {
            repostsCount: { decrement: source.repostsCount > 0 ? 1 : 0 },
          },
          select: { id: true },
        });

        return repost.id;
      });

      repostPostId = result;
    } catch (err) {
      this.throwUnexpectedPersistenceFailure("undo repost", err);
    }

    if (repostPostId !== undefined) {
      await this.postCacheService.invalidateAfterRepostChange(
        source.id,
        currentUserId,
        source.authorId,
        repostPostId,
      );
    }

    return { message: "Repost removed successfully" };
  }

  /** Creates a quote post with validated commentary around a visible root source. */
  async quotePost(
    currentUserId: number,
    input: QuotePostCommand,
  ): Promise<CreatedPostDTO> {
    await this.assertActiveCurrentUserById(currentUserId);
    const data = this.parseQuotePostInput(input);
    const source = await this.getVisibleRootSourcePost(
      currentUserId,
      data.sourcePostId,
    );

    if (source.authorId === currentUserId) {
      throw new ForbiddenException("You cannot quote your own post");
    }

    this.mentionsService.validatePostContentMentions(data.content);
    this.hashtagsService.validatePostContentHashtags(data.content);

    let post: CreatedPostDTO;
    let hashtagSync: HashtagSyncResult = {
      changed: false,
      publicCountChanged: false,
    };

    try {
      post = await this.prisma.$transaction(async (tx) => {
        const created = await tx.post.create({
          data: {
            kind: PostKind.QUOTE,
            title: data.title ?? undefined,
            content: data.content,
            author: { connect: { id: currentUserId } },
            sourcePost: { connect: { id: source.id } },
          },
          select: CreatedPostSelect,
        });

        const author = await tx.user.findUnique({
          where: { id: currentUserId },
          select: { accountState: true, privacySetting: true },
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
      if (err instanceof HttpException) throw err;
      this.throwUnexpectedPersistenceFailure("quote post", err);
    }

    await this.postCacheService.invalidateAfterCreatePost(
      post.id,
      currentUserId,
      hashtagSync.publicCountChanged,
    );
    await this.postCacheService.invalidateAfterRepostChange(
      source.id,
      currentUserId,
      source.authorId,
      post.id,
    );

    await runBestEffort(
      this.logger,
      "error",
      `Failed to sync mentions after quoting post ${post.id}`,
      async () => {
        await this.mentionsService.syncPostMentions({
          postId: post.id,
          actorId: currentUserId,
          content: data.content,
        });
      },
    );

    await this.enqueueHomeFeedFanout(post.id, currentUserId, post.createdAt);
    await this.notifyPostQuoted(source.authorId, currentUserId, source.id);

    return post;
  }

  /** Parses and normalizes quote-post input. */
  private parseQuotePostInput(input: QuotePostCommand): QuotePostCommand {
    return parseWithBadRequest(
      quotePostCommandSchema,
      input,
      "Invalid quote post input",
    );
  }

  /** Resolves the requested post to its root original source if it exists. */
  private async resolveRootSourcePost(
    postId: number,
  ): Promise<RootSourcePost | null> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        kind: true,
        sourcePostId: true,
        authorId: true,
        repostsCount: true,
      },
    });

    if (!post) return null;
    if (post.kind === PostKind.ORIGINAL) return post;
    if (!post.sourcePostId) return null;

    return this.prisma.post.findUnique({
      where: { id: post.sourcePostId },
      select: { id: true, authorId: true, repostsCount: true },
    });
  }

  /** Loads a root source only when normal viewer read rules allow it. */
  private async getVisibleRootSourcePost(
    currentUserId: number,
    postId: number,
  ): Promise<RootSourcePost> {
    const source = await this.resolveRootSourcePost(postId);

    if (!source) {
      throw new NotFoundException("Post not found");
    }

    const blockedAuthorIds =
      await this.postReadService.getBlockedAuthorIds(currentUserId);
    const mutedAuthorIds = await this.mutesService.getMutedUserIdsForScope(
      currentUserId,
      MuteScope.POSTS,
    );
    const filters: Prisma.PostWhereInput[] = [
      { id: source.id },
      { kind: PostKind.ORIGINAL },
      { removedAt: null },
      { author: { accountState: { not: AccountState.DEACTIVATED } } },
      ...this.postReadService.buildViewerVisibilityFilters(currentUserId),
    ];

    if (blockedAuthorIds.length > 0) {
      filters.push({ authorId: { notIn: blockedAuthorIds } });
    }

    if (mutedAuthorIds.length > 0) {
      filters.push({ authorId: { notIn: mutedAuthorIds } });
    }

    const visible = await this.prisma.post.findFirst({
      where: { AND: filters },
      select: { id: true, authorId: true, repostsCount: true },
    });

    if (!visible) {
      throw new NotFoundException("Post not found");
    }

    return visible;
  }

  /** Sends a best-effort repost notification to the root source author. */
  private async notifyPostReposted(
    recipientId: number,
    actorId: number,
    postId: number,
  ): Promise<void> {
    const actorUsername = await this.getActorUsername(actorId);
    if (!actorUsername) return;

    await runBestEffort(
      this.logger,
      "error",
      `Failed to notify source author ${recipientId} about repost ${postId}`,
      async () => {
        await this.notificationTrigger.notifyPostReposted({
          recipientId,
          actorId,
          actorUsername,
          postId,
        });
      },
    );
  }

  /** Sends a best-effort quote notification to the root source author. */
  private async notifyPostQuoted(
    recipientId: number,
    actorId: number,
    postId: number,
  ): Promise<void> {
    const actorUsername = await this.getActorUsername(actorId);
    if (!actorUsername) return;

    await runBestEffort(
      this.logger,
      "error",
      `Failed to notify source author ${recipientId} about quote ${postId}`,
      async () => {
        await this.notificationTrigger.notifyPostQuoted({
          recipientId,
          actorId,
          actorUsername,
          postId,
        });
      },
    );
  }

  /** Reads the actor username needed for notification copy. */
  private async getActorUsername(actorId: number): Promise<string | null> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { username: true },
    });

    return actor?.username ?? null;
  }

  /** Queues existing home-feed fanout work for the created derivative post. */
  private async enqueueHomeFeedFanout(
    postId: number,
    authorId: number,
    postCreatedAt: Date,
  ): Promise<void> {
    if (!this.feedProjectionEnqueueEnabled) return;

    await runBestEffort(
      this.logger,
      "error",
      `Failed to enqueue home feed fanout for post ${postId}`,
      async () => {
        await this.outboxService.enqueue({
          eventType: HOME_FEED_POST_FANOUT_EVENT,
          aggregateType: "post",
          aggregateId: postId,
          payload: {
            postId,
            authorId,
            postCreatedAt: postCreatedAt.toISOString(),
            reason: "FOLLOWING_POST",
          },
        });
      },
    );
  }

  /** Ensures authenticated repost writes cannot be performed by disabled accounts. */
  private async assertActiveCurrentUserById(
    currentUserId: number,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: { accountState: true },
    });

    if (!user) {
      throw new NotFoundException("Current user not found");
    }

    if (user.accountState === AccountState.SUSPENDED) {
      throw new ForbiddenException({
        message: "This account is suspended",
        code: GRAPHQL_ERROR_CODES.ACCOUNT_SUSPENDED,
      });
    }

    if (user.accountState === AccountState.DEACTIVATED) {
      throw new ForbiddenException({
        message: "This account is deactivated",
        code: GRAPHQL_ERROR_CODES.ACCOUNT_DEACTIVATED,
      });
    }
  }

  /** Logs and throws a sanitized internal server error for unexpected repost failures. */
  private throwUnexpectedPersistenceFailure(
    action: "repost post" | "undo repost" | "quote post",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}
