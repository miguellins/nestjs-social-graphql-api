import { Resolver, Mutation, Query, Args, Int } from "@nestjs/graphql";

import { CreateUserInput } from "./dto/create-user.input";

import { UsersService } from "./users.service";
import { User } from "./users.model";
import { UpdateUserInput } from "./dto/update-user.input";

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) { }

  @Query(() => [User])
  async users(): Promise<User[]> {
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
}
