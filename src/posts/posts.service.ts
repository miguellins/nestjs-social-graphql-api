import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "src/prisma.service";

import { Prisma } from "@prisma/client";

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) { }

  async getAllPosts() {
    return this.prisma.post.findMany({
      include: {
        author: true,
        likes: { include: { user: true } },
      },
    });
  }

  async getPost(id: number) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: true,
        likes: { include: { user: true } },
      },
    });

    if (!post) throw new NotFoundException("Post not found");

    return post;
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
        likes: true,
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
          likes: true,
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

  async deletePost(id: number) {
    const post = await this.prisma.post.findUnique({
      where: { id },
    });

    if (!post) throw new NotFoundException("Post not found");

    return this.prisma.post.delete({
      where: { id },
      include: {
        author: true,
        likes: true,
      },
    });
  }
}
