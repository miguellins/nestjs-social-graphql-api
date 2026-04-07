import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";
import { Public } from "@/common/decorators/auth.decorator";

import { GetUserByUsernameArgs } from "@/users/args/get-user-by-username.args";
import { CreatedUser } from "@/users/models/created-user.model";
import { CreateUserInput } from "@/users/dto/create-user.input";
import { UpdateUserInput } from "@/users/dto/update-user.input";
import { SafeUser } from "@/users/models/safe-user.model";
import { UserPage } from "@/users/models/user-page.model";
import { UsersService } from "@/users/users.service";

@Resolver(() => SafeUser)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => UserPage, { name: "users" })
  async users(@Args() args: CursorPaginationArgs) {
    return this.usersService.findUsers(args);
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.READ })
  @Query(() => SafeUser, { name: "userById" })
  async userById(@Args("id", { type: () => Int }) id: number) {
    return this.usersService.getUser(id);
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.READ })
  @Query(() => SafeUser, { name: "userByUsername" })
  async userByUsername(@Args() args: GetUserByUsernameArgs): Promise<SafeUser> {
    return this.usersService.getUserByUsername(args.username);
  }

  // Set to Public
  @Public()
  @Throttle({ default: THROTTLE_LIMITS.SIGNUP })
  @Mutation(() => CreatedUser, { name: "createUser" })
  async createUser(
    @Args("input") input: CreateUserInput,
  ): Promise<CreatedUser> {
    return this.usersService.createUser(input);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => SafeUser, { name: "updateMe" })
  async updateMe(
    @Args("input") input: UpdateUserInput,
    @CurrentUser() user: { id: number },
  ): Promise<SafeUser> {
    return this.usersService.updateUser(input, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.DESTRUCTIVE })
  @Mutation(() => MessageResponse, { name: "deleteMe" })
  async deleteMe(
    @CurrentUser() user: { id: number },
  ): Promise<MessageResponse> {
    return this.usersService.deleteUser(user.id);
  }
}
