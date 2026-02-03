import { Resolver, Mutation, Query, Args, Int } from "@nestjs/graphql";

import { UpdateUserInput } from "./dto/update-user.input";

import { UsersService } from "./users.service";
import { User } from "./users.model";

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => [User])
  async users(): Promise<User[]> {
    return this.usersService.getAllUsers();
  }

  @Query(() => User)
  async user(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<User | null> {
    return this.usersService.getUser(id);
  }

  @Mutation(() => User)
  async updateUser(
    @Args("id", { type: () => Int }) id: number,
    @Args("input") input: UpdateUserInput,
  ): Promise<User> {
    return this.usersService.updateUser(id, input);
  }

  @Mutation(() => Boolean)
  async deleteUser(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<boolean> {
    await this.usersService.deleteUser(id);
    return true;
  }
}
