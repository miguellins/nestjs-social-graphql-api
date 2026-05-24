import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";
import { Public } from "@/common/decorators/auth.decorator";

import { CreatedPost } from "@/posts/models/created-post.model";

import { FindMyRepostsArgs } from "@/reposts/args/find-my-reposts.args";
import { FindRepostsArgs } from "@/reposts/args/find-reposts.args";
import { RepostPage } from "@/reposts/models/repost-page.model";

import { QuotePostInput } from "@/reposts/dto/quote-post.input";
import { RepostPostPayload } from "@/reposts/models/repost-post-payload.model";
import { RepostsService } from "@/reposts/reposts.service";

@Resolver()
export class RepostsResolver {
  constructor(private readonly repostsService: RepostsService) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => RepostPage, { name: "reposts" })
  async reposts(
    @Args() args: FindRepostsArgs,
    @CurrentUser()
    user:
      | import("@/auth/authenticated-user.type").AuthenticatedUser
      | null = null,
  ): Promise<RepostPage> {
    return this.repostsService.findReposts(args, user ?? undefined);
  }

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => RepostPage, { name: "myReposts" })
  async myReposts(
    @Args() args: FindMyRepostsArgs,
    @CurrentUser() user: { id: number },
  ): Promise<RepostPage> {
    return this.repostsService.findMyReposts(user.id, args);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => RepostPostPayload, { name: "repostPost" })
  async repostPost(
    @Args("postId", { type: () => Int }) postId: number,
    @CurrentUser() user: { id: number },
  ): Promise<RepostPostPayload> {
    return this.repostsService.repostPost(user.id, postId);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "undoRepost" })
  async undoRepost(
    @Args("postId", { type: () => Int }) postId: number,
    @CurrentUser() user: { id: number },
  ): Promise<MessageResponse> {
    return this.repostsService.undoRepost(user.id, postId);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => CreatedPost, { name: "quotePost" })
  async quotePost(
    @Args("input") input: QuotePostInput,
    @CurrentUser() user: { id: number },
  ): Promise<CreatedPost> {
    return this.repostsService.quotePost(user.id, input);
  }
}
