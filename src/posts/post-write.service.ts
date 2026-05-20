import {
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { MessageResponse } from "@/common/types/message-response.type";
import { runBestEffort } from "@/common/errors/run-best-effort";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";

import { PostCacheService } from "@/posts/post-cache.service";
import {
  type CreatedPostDTO,
  CreatedPostSelect,
} from "@/posts/dto/created-post.dto";
import {
  type SafePostListDTO,
  SafePostListSelect,
} from "@/posts/dto/safe-post-list.dto";
import {
  createPostCommandSchema,
  updatePostCommandSchema,
  type CreatePostCommand,
  type UpdatePostCommand,
} from "@/posts/schemas/post-write.schema";

import { HOME_FEED_POST_FANOUT_EVENT } from "@/outbox/events/home-feed-post-fanout.event";
import { OutboxService } from "@/outbox/outbox.service";

import { MentionsService } from "@/mentions/mentions.service";

import {
  HashtagsService,
  type HashtagSyncResult,
} from "@/hashtags/hashtags.service";

import { AccountState } from "@/users/enums/account-state.enum";

import { PrismaService } from "@/prisma/prisma.service";

import { Prisma } from "@prisma/client";

@Injectable()
export class PostWriteService {
  private readonly logger = new Logger(PostWriteService.name);
  private readonly feedProjectionEnqueueEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly postCacheService: PostCacheService,
    private readonly mentionsService: MentionsService,
    private readonly hashtagsService: HashtagsService,
    private readonly outboxService: OutboxService,
    configService: ConfigService,
  ) {
    this.feedProjectionEnqueueEnabled =
      configService.get<boolean>("FEED_PROJECTION_ENQUEUE_ENABLED") ?? false;
  }

  /** Creates a post and runs post-commit mention, cache, hashtag, and feed side effects. */
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

    await this.postCacheService.invalidateAfterCreatePost(
      post.id,
      currentUserId,
      hashtagSync.publicCountChanged,
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

  /** Updates a post and preserves existing ownership, hashtag, mention, and cache behavior. */
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

    await this.postCacheService.invalidateAfterUpdatePost(
      id,
      currentUserId,
      hashtagSync.publicCountChanged,
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

  /** Deletes a post after ownership checks and runs existing cache and hashtag side effects. */
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

    await this.postCacheService.invalidateAfterDeletePost(
      id,
      currentUserId,
      hashtagSync.publicCountChanged,
    );

    return {
      message: "Post deleted successfully",
    };
  }

  /** Parses and normalizes create-post input. */
  private parseCreatePostInput(input: CreatePostCommand) {
    return parseWithBadRequest(
      createPostCommandSchema,
      input,
      "Invalid post input",
    );
  }

  /** Parses and normalizes update-post input. */
  private parseUpdatePostInput(input: UpdatePostCommand) {
    return parseWithBadRequest(
      updatePostCommandSchema,
      input,
      "Invalid post input",
    );
  }

  /** Determines whether the provided input would change a post's content fields. */
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

  /** Logs and throws a sanitized internal server error for unexpected persistence failures. */
  private throwUnexpectedPersistenceFailure(
    action: "create post" | "update post" | "delete post",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  /** Ensures authenticated post writes cannot be performed by disabled accounts. */
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
