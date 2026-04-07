import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CompletePostMediaUploadInput } from "@/media/dto/complete-post-media-upload.input";
import { RequestPostMediaUploadInput } from "@/media/dto/request-post-media-upload.input";
import { RequestPostMediaUpload } from "@/media/models/request-post-media-upload.model";
import { AttachMediaToPostInput } from "@/media/dto/attach-media-to-post.input";
import { MediaViewUrl } from "@/media/models/media-view-url.model";
import { MediaPage } from "@/media/models/media-page.model";
import { MyMediaArgs } from "@/media/args/my-media.args";
import { MediaService } from "@/media/media.service";
import { Media } from "@/media/models/media.model";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";

import { AttachMediaPostResult } from "@/posts/models/attach-media-post-result.model";

@Resolver(() => Media)
export class MediaResolver {
  constructor(private readonly mediaService: MediaService) {}

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => RequestPostMediaUpload, { name: "requestPostMediaUpload" })
  async requestPostMediaUpload(
    @Args("input") input: RequestPostMediaUploadInput,
    @CurrentUser() user: { id: number },
  ): Promise<RequestPostMediaUpload> {
    return this.mediaService.requestPostMediaUpload(input, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => Media, { name: "completePostMediaUpload" })
  async completePostMediaUpload(
    @Args("input") input: CompletePostMediaUploadInput,
    @CurrentUser() user: { id: number },
  ): Promise<Media> {
    return this.mediaService.completePostMediaUpload(input, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => AttachMediaPostResult, { name: "attachMediaToPost" })
  async attachMediaToPost(
    @Args("input") input: AttachMediaToPostInput,
    @CurrentUser() user: { id: number },
  ): Promise<AttachMediaPostResult> {
    return this.mediaService.attachMediaToPost(input, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => MediaPage, { name: "myMedia" })
  async myMedia(
    @CurrentUser() user: { id: number },
    @Args() args: MyMediaArgs,
  ): Promise<MediaPage> {
    return this.mediaService.myMedia(user.id, args);
  }

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => MediaViewUrl, { name: "mediaSignedViewUrl" })
  async mediaSignedViewUrl(
    @Args("mediaId", { type: () => Int }) mediaId: number,
    @CurrentUser() user: { id: number },
  ): Promise<MediaViewUrl> {
    return this.mediaService.createMediaSignedViewUrl(mediaId, user.id);
  }
}
