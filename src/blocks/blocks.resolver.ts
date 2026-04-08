import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";

import { MyBlockedUsersArgs } from "@/blocks/args/my-blocked-users.args";
import { UnblockUserInput } from "@/blocks/dto/unblock-user.input";
import { BlockUserInput } from "@/blocks/dto/block-user.input";
import { BlocksService } from "@/blocks/blocks.service";

import { SafeUser } from "@/users/models/safe-user.model";
import { UserPage } from "@/users/models/user-page.model";

@Resolver(() => SafeUser)
export class BlocksResolver {
  constructor(private readonly blocksService: BlocksService) {}

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "blockUser" })
  async blockUser(
    @Args("input") input: BlockUserInput,
    @CurrentUser() user: { id: number },
  ): Promise<MessageResponse> {
    return this.blocksService.blockUser(user.id, input.targetUserId);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "unblockUser" })
  async unblockUser(
    @Args("input") input: UnblockUserInput,
    @CurrentUser() user: { id: number },
  ): Promise<MessageResponse> {
    return this.blocksService.unblockUser(user.id, input.targetUserId);
  }

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => UserPage, { name: "myBlockedUsers" })
  async myBlockedUsers(
    @Args() args: MyBlockedUsersArgs,
    @CurrentUser() user: { id: number },
  ): Promise<UserPage> {
    return this.blocksService.findMyBlockedUsers(user.id, args);
  }
}
