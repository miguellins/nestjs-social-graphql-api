import { Module } from "@nestjs/common";

import { MediaReadProjectionService } from "@/media/media-read-projection.service";
import { MediaValidationService } from "@/media/media-validation.service";
import { R2StorageService } from "@/media/storage/r2-storage.service";
import { MediaPolicyService } from "@/media/media-policy.service";
import { MediaQueryService } from "@/media/media-query.service";
import { MediaResolver } from "@/media/media.resolver";
import { MediaService } from "@/media/media.service";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";

import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule, CacheHelpersModule],
  providers: [
    R2StorageService,
    MediaPolicyService,
    MediaQueryService,
    MediaReadProjectionService,
    MediaValidationService,
    MediaService,
    MediaResolver,
  ],
  exports: [
    MediaService,
    MediaPolicyService,
    MediaQueryService,
    MediaReadProjectionService,
  ],
})
export class MediaModule {}
