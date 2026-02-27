import { Module } from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";

@Module({
  providers: [CacheHelperService],
  exports: [CacheHelperService],
})
export class CacheModule {}
