import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.post.findMany({
      include: { author: true },
    });
  }

  async createPost(input: {
    title: string;
    content: string;
    authorId: number;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: input.authorId },
    });

    if (!user) throw new NotFoundException("User (author) not found");

    return this.prisma.post.create({
      data: {
        title: input.title,
        content: input.content,
        authorId: input.authorId,
      },
      include: {
        author: true,
      },
    });
  }
}
