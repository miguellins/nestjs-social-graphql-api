import { Resolver, Query } from "@nestjs/graphql";

import { PrismaService } from "../prisma.service";

import { User } from "./users.model";

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [User])
  users() {
    return this.prisma.user.findMany();
  }
}
