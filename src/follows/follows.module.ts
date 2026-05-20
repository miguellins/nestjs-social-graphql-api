import { Module } from "@nestjs/common";

import { NotificationsModule } from "@/notifications/notifications.module";
import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";

import { FollowCacheService } from "@/follows/follow-cache.service";
import { FollowFeedTriggerService } from "@/follows/follow-feed-trigger.service";
import { FollowGuardsService } from "@/follows/follow-guards.service";
import { FollowRelationshipService } from "@/follows/follow-relationship.service";
import { FollowRequestReadService } from "@/follows/follow-request-read.service";
import { FollowRequestService } from "@/follows/follow-request.service";
import { FollowRequestTransitionService } from "@/follows/follow-request-transition.service";
import { FollowsResolver } from "@/follows/follows.resolver";
import { FollowsService } from "@/follows/follows.service";

import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule, CacheHelpersModule, NotificationsModule],
  providers: [
    FollowCacheService,
    FollowFeedTriggerService,
    FollowGuardsService,
    FollowRelationshipService,
    FollowRequestReadService,
    FollowRequestService,
    FollowRequestTransitionService,
    FollowsService,
    FollowsResolver,
  ],
  exports: [FollowsService],
})
export class FollowsModule {}
