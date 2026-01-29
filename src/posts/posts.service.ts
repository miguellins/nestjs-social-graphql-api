import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
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

  async updatePost(
    id: number,
    input: {
      title?: string;
      content?: string;
    },
  ) {
    const post = await this.prisma.post.findUnique({
      where: { id },
    });

    if (!post) throw new NotFoundException("Post not found");

    const data: any = {};

    if (!input.title !== undefined) data.title = input.title;
    if (!input.content !== undefined) data.content = input.content;

    try {
      return await this.prisma.post.update({
        where: { id },
        data,
        include: {
          author: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const fields =
          (err.meta?.target as string[] | undefined)?.join(", ") ??
          "unique field";
        throw new ConflictException(`User with this ${fields} already exists`);
      }

      throw new InternalServerErrorException("Failed to update user");
    }
  }
}
