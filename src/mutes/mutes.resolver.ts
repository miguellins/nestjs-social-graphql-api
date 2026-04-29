import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";

import { MutedUserPage } from "@/mutes/models/muted-user-page.model";
import { UnmuteUserInput } from "@/mutes/dto/unmute-user.input";
import { MuteUserInput } from "@/mutes/dto/mute-user.input";
import { MuteEdgeDTO } from "@/mutes/dto/mute-edge.dto";
import { MutesService } from "@/mutes/mutes.service";

@Resolver()
export class MutesResolver {
  constructor(private readonly mutesService: MutesService) {}

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MuteEdgeDTO, { name: "muteUser" })
  async muteUser(
    @Args("input") input: MuteUserInput,
    @CurrentUser() user: { id: number },
  ): Promise<MuteEdgeDTO> {
    return this.mutesService.muteUser(user.id, input.userId);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => Boolean, { name: "unmuteUser" })
  async unmuteUser(
    @Args("input") input: UnmuteUserInput,
    @CurrentUser() user: { id: number },
  ): Promise<boolean> {
    return this.mutesService.unmuteUser(user.id, input.userId);
  }

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => MutedUserPage, { name: "myMutedUsers" })
  async myMutedUsers(
    @Args() args: CursorPaginationArgs,
    @CurrentUser() user: { id: number },
  ): Promise<MutedUserPage> {
    return this.mutesService.findMyMutedUsers(user.id, args);
  }

  @Throttle({ default: THROTTLE_LIMITS.READ })
  @Query(() => Boolean, { name: "isMuted" })
  async isMuted(
    @Args("userId", { type: () => Int }) userId: number,
    @CurrentUser() user: { id: number },
  ): Promise<boolean> {
    return this.mutesService.isMuted(user.id, userId);
  }
}
