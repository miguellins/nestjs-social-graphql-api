import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { CreateUserInput } from "./dto/create-user.input";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  async findAll() {
    return this.prisma.user.findMany();
  }

  async createUser(input: {
    name: string;
    email: string;
    username: string;
    password: string
  }) {
    return this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        username: input.username,
        password: input.password,
      },
    });
  }
}
