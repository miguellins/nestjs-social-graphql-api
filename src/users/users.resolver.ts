import { Resolver, Mutation, Query, Args } from "@nestjs/graphql";

import { CreateUserInput } from "./dto/create-user.input";

import { UsersService } from "./users.service";
import { User } from "./users.model";

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => [User])
  async users(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Mutation(() => User)
  createUser(@Args("input") input: CreateUserInput) {
    return this.usersService.createUser(input);
  }
}
