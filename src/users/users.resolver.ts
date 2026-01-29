import { Resolver, Mutation, Query, Args, Int } from "@nestjs/graphql";

import { CreateUserInput } from "./dto/create-user.input";
import { UpdateUserInput } from "./dto/update-user.input";

import { UsersService } from "./users.service";
import { User } from "./users.model";

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) { }

  @Query(() => [User])
  async getAllUsers(): Promise<User[]> {
    return this.usersService.getAllUsers();
  }

  @Mutation(() => User)
  async createUser(@Args("input") input: CreateUserInput) {
    return this.usersService.createUser(input);
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
