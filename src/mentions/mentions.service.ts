import { Injectable } from "@nestjs/common";

import { NotificationTriggerService } from "@/notifications/notification-trigger.service";

import { extractUniqueMentionUsernames } from "@/mentions/mention-parser";

import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { AccountState } from "@/users/enums/account-state.enum";

import { PrismaService } from "@/prisma/prisma.service";

type MentionedUser = {
  id: number;
  username: string;
};

type SyncPostMentionsParams = {
  postId: number;
  actorId: number;
  content: string;
};

type SyncCommentMentionsParams = {
  commentId: number;
  actorId: number;
  content: string;
};

type ReadablePost = {
  id: number;
  authorId: number;
  removedAt: Date | null;
  author: {
    accountState: AccountState;
    privacySetting: UserPrivacySetting;
  };
};

type VisibilityPrerequisites = {
  blockedViewerIds: Set<number>;
  followingViewerIds: Set<number>;
};

@Injectable()
export class MentionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationTrigger: NotificationTriggerService,
  ) {}

  /** Validates mention syntax and cap limits before a post write is attempted. */
  validatePostContentMentions(content: string): void {
    extractUniqueMentionUsernames(content);
  }

  /** Validates mention syntax and cap limits before a comment write is attempted. */
  validateCommentContentMentions(content: string): void {
    extractUniqueMentionUsernames(content);
  }

  /** Recomputes durable post mentions and notifies only newly added visible recipients. */
  async syncPostMentions({
    postId,
    actorId,
    content,
  }: SyncPostMentionsParams): Promise<void> {
    const usernames = extractUniqueMentionUsernames(content);
    const resolvedUsers = await this.resolveMentionedUsers(usernames);
    const nextMentionedUserIds = resolvedUsers.map((user) => user.id);
    const previousMentionedUserIds =
      await this.getExistingPostMentionUserIds(postId);

    await this.replacePostMentions(postId, nextMentionedUserIds);

    const recipients = resolvedUsers.filter(
      (user) =>
        user.id !== actorId &&
        !previousMentionedUserIds.has(user.id) &&
        nextMentionedUserIds.includes(user.id),
    );

    if (recipients.length === 0) {
      return;
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: {
        username: true,
      },
    });

    if (!actor) {
      return;
    }

    const post = await this.getReadablePostForMentions(postId);

    if (!post) {
      return;
    }

    const visibleRecipientIds = await this.filterVisibleRecipientIds(
      post,
      recipients.map((recipient) => recipient.id),
    );

    for (const recipient of recipients) {
      if (!visibleRecipientIds.has(recipient.id)) {
        continue;
      }

      await this.notificationTrigger.notifyPostMentioned({
        recipientId: recipient.id,
        actorId,
        actorUsername: actor.username,
        postId,
      });
    }
  }

  /** Recomputes durable comment mentions and notifies only newly added visible recipients. */
  async syncCommentMentions({
    commentId,
    actorId,
    content,
  }: SyncCommentMentionsParams): Promise<void> {
    const usernames = extractUniqueMentionUsernames(content);
    const resolvedUsers = await this.resolveMentionedUsers(usernames);
    const nextMentionedUserIds = resolvedUsers.map((user) => user.id);
    const previousMentionedUserIds =
      await this.getExistingCommentMentionUserIds(commentId);

    await this.replaceCommentMentions(commentId, nextMentionedUserIds);

    const recipients = resolvedUsers.filter(
      (user) =>
        user.id !== actorId &&
        !previousMentionedUserIds.has(user.id) &&
        nextMentionedUserIds.includes(user.id),
    );

    if (recipients.length === 0) {
      return;
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: {
        username: true,
      },
    });

    if (!actor) {
      return;
    }

    const post = await this.getReadablePostForCommentMentions(commentId);

    if (!post) {
      return;
    }

    const visibleRecipientIds = await this.filterVisibleRecipientIds(
      post,
      recipients.map((recipient) => recipient.id),
    );

    for (const recipient of recipients) {
      if (!visibleRecipientIds.has(recipient.id)) {
        continue;
      }

      await this.notificationTrigger.notifyCommentMentioned({
        recipientId: recipient.id,
        actorId,
        actorUsername: actor.username,
        commentId,
      });
    }
  }

  /** Resolves active mentioned users while preserving the parser order from the authored text. */
  private async resolveMentionedUsers(
    usernames: string[],
  ): Promise<MentionedUser[]> {
    if (usernames.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: {
        username: {
          in: usernames,
        },
        accountState: AccountState.ACTIVE,
      },
      select: {
        id: true,
        username: true,
      },
    });

    const byUsername = new Map(users.map((user) => [user.username, user]));

    return usernames
      .map((username) => byUsername.get(username))
      .filter((user): user is MentionedUser => user !== undefined);
  }

  /** Reads the currently stored durable mention recipient ids for a post. */
  private async getExistingPostMentionUserIds(
    postId: number,
  ): Promise<Set<number>> {
    const rows = await this.prisma.postMention.findMany({
      where: { postId },
      select: {
        mentionedUserId: true,
      },
    });

    return new Set(rows.map((row) => row.mentionedUserId));
  }

  /** Reads the currently stored durable mention recipient ids for a comment. */
  private async getExistingCommentMentionUserIds(
    commentId: number,
  ): Promise<Set<number>> {
    const rows = await this.prisma.commentMention.findMany({
      where: { commentId },
      select: {
        mentionedUserId: true,
      },
    });

    return new Set(rows.map((row) => row.mentionedUserId));
  }

  /** Reconciles durable post mention rows without clearing unchanged rows on each edit. */
  private async replacePostMentions(
    postId: number,
    mentionedUserIds: number[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (mentionedUserIds.length === 0) {
        await tx.postMention.deleteMany({
          where: { postId },
        });
        return;
      }

      await tx.postMention.deleteMany({
        where: {
          postId,
          mentionedUserId: {
            notIn: mentionedUserIds,
          },
        },
      });

      await tx.postMention.createMany({
        data: mentionedUserIds.map((mentionedUserId) => ({
          postId,
          mentionedUserId,
        })),
        skipDuplicates: true,
      });
    });
  }

  /** Reconciles durable comment mention rows against the latest stored comment content. */
  private async replaceCommentMentions(
    commentId: number,
    mentionedUserIds: number[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (mentionedUserIds.length === 0) {
        await tx.commentMention.deleteMany({
          where: { commentId },
        });
        return;
      }

      await tx.commentMention.deleteMany({
        where: {
          commentId,
          mentionedUserId: {
            notIn: mentionedUserIds,
          },
        },
      });

      await tx.commentMention.createMany({
        data: mentionedUserIds.map((mentionedUserId) => ({
          commentId,
          mentionedUserId,
        })),
        skipDuplicates: true,
      });
    });
  }

  /** Loads the post visibility source for one comment mention flow. */
  private async getReadablePostForCommentMentions(
    commentId: number,
  ): Promise<ReadablePost | null> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        removedAt: true,
        post: {
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
        },
      },
    });

    if (!comment || comment.removedAt) {
      return null;
    }

    return comment.post;
  }

  /** Loads the post visibility source for one post mention flow. */
  private async getReadablePostForMentions(
    postId: number,
  ): Promise<ReadablePost | null> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
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

    return post;
  }

  /** Resolves which recipients can see the given post using batched block/follow lookups. */
  private async filterVisibleRecipientIds(
    post: ReadablePost,
    viewerIds: number[],
  ): Promise<Set<number>> {
    if (post.removedAt || post.author.accountState !== AccountState.ACTIVE) {
      return new Set();
    }

    if (viewerIds.length === 0) {
      return new Set();
    }

    const prerequisites = await this.getVisibilityPrerequisites(
      post,
      viewerIds,
    );
    const visibleRecipientIds = new Set<number>();

    for (const viewerId of viewerIds) {
      if (viewerId === post.authorId) {
        visibleRecipientIds.add(viewerId);
        continue;
      }

      if (prerequisites.blockedViewerIds.has(viewerId)) {
        continue;
      }

      if (post.author.privacySetting === UserPrivacySetting.PUBLIC) {
        visibleRecipientIds.add(viewerId);
        continue;
      }

      if (prerequisites.followingViewerIds.has(viewerId)) {
        visibleRecipientIds.add(viewerId);
      }
    }

    return visibleRecipientIds;
  }

  /** Loads the shared block and follow edges needed to evaluate many recipients at once. */
  private async getVisibilityPrerequisites(
    post: ReadablePost,
    viewerIds: number[],
  ): Promise<VisibilityPrerequisites> {
    const [blockRows, followRows]: [
      { blockerId: number; blockedId: number }[],
      { followerId: number }[],
    ] = await Promise.all([
      this.prisma.userBlock.findMany({
        where: {
          OR: [
            {
              blockerId: {
                in: viewerIds,
              },
              blockedId: post.authorId,
            },
            {
              blockerId: post.authorId,
              blockedId: {
                in: viewerIds,
              },
            },
          ],
        },
        select: {
          blockerId: true,
          blockedId: true,
        },
      }),
      post.author.privacySetting === UserPrivacySetting.PRIVATE
        ? this.prisma.follow.findMany({
            where: {
              followerId: {
                in: viewerIds,
              },
              followingId: post.authorId,
            },
            select: {
              followerId: true,
            },
          })
        : Promise.resolve<{ followerId: number }[]>([]),
    ]);

    return {
      blockedViewerIds: new Set(
        blockRows.map((row) =>
          row.blockerId === post.authorId ? row.blockedId : row.blockerId,
        ),
      ),
      followingViewerIds: new Set(followRows.map((row) => row.followerId)),
    };
  }
}
