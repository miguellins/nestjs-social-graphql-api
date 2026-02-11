import { Resolver, Mutation, Query, Args, Int } from "@nestjs/graphql";

import { CurrentUser } from "src/common/decorators/current-user.decorator";
import { Public } from "src/common/decorators/auth.decorator";

import { DeleteResponse } from "src/common/types/delete-response.type";

import { UpdateUserInput } from "./dto/update-user.input";
import { CreateUserInput } from "./dto/create-user.input";

import { UsersService } from "./users.service";

import { SafeUserProfile } from "./models/safe-user-profile.model";
import { SafeUser } from "./models/safe-user.model";
import { User } from "./models/users.model";

import { UsersArgs } from "./dto/users.args";

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) { }

  @Public()
  @Query(() => [SafeUser])
  async users(@Args() args: UsersArgs): Promise<SafeUser[]> {
    return this.usersService.findUsers({ take: args.take });
  }

  @Public()
  @Query(() => SafeUserProfile)
  async userById(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<SafeUserProfile> {
    return this.usersService.getUser(id);
  }

  // Set to Public
  @Public()
  @Mutation(() => SafeUser)
  async createUser(@Args("input") input: CreateUserInput): Promise<SafeUser> {
    return this.usersService.createUser(input);
  }

  @Mutation(() => SafeUser)
  async updateUser(
    @Args("input") input: UpdateUserInput,
    @CurrentUser() user: { id: number },
  ): Promise<SafeUser> {
    return this.usersService.updateUser(input, user.id);
  }

  @Mutation(() => DeleteResponse)
  async deleteUser(
    @CurrentUser() user: { id: number },
  ): Promise<DeleteResponse> {
    await this.usersService.deleteUser(user.id);

    return {
      message: "User deleted successfully",
    };
  }
}
