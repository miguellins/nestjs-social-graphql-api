import { Resolver, Mutation, Query, Args, Int } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { DeleteResponse } from "@/common/types/delete-response.type";
import { PaginationArgs } from "@/common/args/pagination.args";
import { Public } from "@/common/decorators/auth.decorator";

import { UpdateUserInput } from "@/users/dto/update-user.input";
import { CreateUserInput } from "@/users/dto/create-user.input";

import { SafeUser } from "@/users/models/safe-user.model";

import { UsersService } from "@/users/users.service";

/**
 * Responsible for resolving fields of the SafeUser GraphQL type
 */

@Resolver(() => SafeUser)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) { }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => [SafeUser])
  async users(@Args() args: PaginationArgs) {
    return this.usersService.findUsers(args);
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.READ })
  @Query(() => SafeUser)
  async userById(@Args("id", { type: () => Int }) id: number) {
    return this.usersService.getUser(id);
  }

  // Set to Public
  @Public()
  @Throttle({ default: THROTTLE_LIMITS.SIGNUP })
  @Mutation(() => SafeUser)
  async createUser(@Args("input") input: CreateUserInput): Promise<SafeUser> {
    return this.usersService.createUser(input);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => SafeUser)
  async updateMe(
    @Args("input") input: UpdateUserInput,
    @CurrentUser() user: { id: number },
  ): Promise<SafeUser> {
    return this.usersService.updateUser(input, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.DESTRUCTIVE })
  @Mutation(() => DeleteResponse)
  async deleteMe(@CurrentUser() user: { id: number }) {
    await this.usersService.deleteUser(user.id);

    return {
      message: "User deleted successfully",
    };
  }
}
