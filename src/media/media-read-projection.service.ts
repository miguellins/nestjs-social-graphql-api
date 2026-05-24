import { Injectable } from "@nestjs/common";

import type { SafeMediaDTO, SafeMediaRecord } from "@/media/dto/safe-media.dto";
import { R2StorageService } from "@/media/storage/r2-storage.service";

import type {
  SafeAttachMediaPostDTO,
  SafeAttachMediaPostRecord,
} from "@/posts/dto/safe-attach-media-post.dto";
import type {
  SafePostDetailDTO,
  SafePostDetailRecord,
} from "@/posts/dto/safe-post-detail.dto";
import type {
  HomeFeedItemDTO,
  HomeFeedItemRecord,
} from "@/posts/dto/home-feed-item.dto";

@Injectable()
export class MediaReadProjectionService {
  constructor(private readonly r2Storage: R2StorageService) {}

  // Derives the current browser-facing URL for one media item
  derivePublicUrl(media: SafeMediaRecord): SafeMediaDTO {
    return {
      ...media,
      publicUrl: this.r2Storage.getPublicUrl(media.objectKey),
    };
  }

  // Derives browser-facing URLs for nested post attachment media
  derivePostDetailMediaUrls(post: SafePostDetailRecord): SafePostDetailDTO {
    if (!post.mediaAttachments?.length) {
      return post as SafePostDetailDTO;
    }

    return {
      ...post,
      mediaAttachments: post.mediaAttachments.map((attachment) => ({
        ...attachment,
        media: this.derivePublicUrl(attachment.media),
      })),
    };
  }

  // Derives browser-facing URLs for nested post attachment media on attach responses
  deriveAttachMediaPostUrls(
    post: SafeAttachMediaPostRecord,
  ): SafeAttachMediaPostDTO {
    if (!post.mediaAttachments?.length) {
      return post as SafeAttachMediaPostDTO;
    }

    return {
      ...post,
      mediaAttachments: post.mediaAttachments.map((attachment) => ({
        ...attachment,
        media: this.derivePublicUrl(attachment.media),
      })),
    };
  }

  // Derives browser-facing URLs and viewer-state flags for feed items
  deriveHomeFeedItemMediaUrls(item: HomeFeedItemRecord): HomeFeedItemDTO {
    return {
      id: item.id,
      title: item.title,
      content: item.content,
      kind: item.kind,
      sourcePostId: item.sourcePostId,
      createdAt: item.createdAt,
      likesCount: item.likesCount,
      commentsCount: item.commentsCount,
      repostsCount: item.repostsCount,
      viewerHasLiked: item.likes.length > 0,
      viewerHasBookmarked: item.bookmarks.length > 0,
      viewerHasReposted: false,
      sourcePost: null,
      author: item.author,
      mediaAttachments: item.mediaAttachments?.map((attachment) => ({
        ...attachment,
        media: this.derivePublicUrl(attachment.media),
      })),
    };
  }
}
