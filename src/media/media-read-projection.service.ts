import { Injectable } from "@nestjs/common";

import type { SafeMediaDTO, SafeMediaRecord } from "@/media/dto/safe-media.dto";
import { R2StorageService } from "@/media/storage/r2-storage.service";

import type {
  SafePostDetailDTO,
  SafePostDetailRecord,
} from "@/posts/dto/safe-post-detail.dto";

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
}
