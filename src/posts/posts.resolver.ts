import { Resolver, Query } from "@nestjs/graphql";

import { PrismaService } from "../prisma.service";

import { Post } from "./posts.model";

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly prisma: PrismaService) { }

  @Query(() => [Post])
  posts() {
    return this.prisma.post.findMany();
  }
}