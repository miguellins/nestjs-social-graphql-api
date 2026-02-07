import { Resolver, Mutation, Query, Args, Int } from "@nestjs/graphql";

import { CurrentUser } from "src/common/decorators/current-user.decorator";

import { UpdateUserInput } from "./dto/update-user.input";
import { CreateUserInput } from "./dto/create-user.input";

import { Public } from "src/common/decorators/auth.decorator";

import { UsersService } from "./users.service";
import { User } from "./users.model";
import { DeleteResponse } from "src/common/types/delete-response.type";

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Query(() => [User])
  async users(): Promise<User[]> {
    return this.usersService.getAllUsers();
  }

  @Public()
  @Query(() => User, { nullable: true })
  async user(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<User | null> {
    return this.usersService.getUser(id);
  }

  // Set to Public
  @Public()
  @Mutation(() => User)
  async createUser(@Args("input") input: CreateUserInput): Promise<User> {
    return this.usersService.createUser(input);
  }

  @Mutation(() => User)
  async updateUser(
    @Args("input") input: UpdateUserInput,
    @CurrentUser() user: { id: number },
  ): Promise<User> {
    return this.usersService.updateUser(input, user.id);
  }

  @Mutation(() => DeleteResponse)
  async deleteUser(
    @Args("id", { type: () => Int }) id: number,
    @CurrentUser() user: { id: number },
  ): Promise<DeleteResponse> {
    await this.usersService.deleteUser(id, user.id);

    return {
      message: "User deleted successfully",
    };
  }
}
