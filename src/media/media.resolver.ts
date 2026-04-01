import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";

import { CompletePostMediaUploadInput } from "@/media/dto/complete-post-media-upload.input";
import { RequestPostMediaUploadInput } from "@/media/dto/request-post-media-upload.input";
import { RequestPostMediaUpload } from "@/media/models/request-post-media-upload.model";
import { AttachMediaToPostInput } from "@/media/dto/attach-media-to-post.input";
import { MediaViewUrl } from "@/media/models/media-view-url.model";
import { MyMediaArgs } from "@/media/args/my-media.args";
import { MediaService } from "@/media/media.service";
import { Media } from "@/media/models/media.model";

import { PostDetail } from "@/posts/models/post-detail.model";

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
  @Mutation(() => PostDetail, { name: "attachMediaToPost" })
  async attachMediaToPost(
    @Args("input") input: AttachMediaToPostInput,
    @CurrentUser() user: { id: number },
  ): Promise<PostDetail> {
    return this.mediaService.attachMediaToPost(input, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => [Media], { name: "myMedia" })
  async myMedia(
    @CurrentUser() user: { id: number },
    @Args() args: MyMediaArgs,
  ): Promise<Media[]> {
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
