import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { AuthService } from "./auth.service";
import { LoginInput } from "./dto/login.input";
import { AuthPayload } from "./auth.payload";
import { Public } from "./auth.decorator";

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Mutation(() => AuthPayload)
  login(@Args("input") input: LoginInput) {
    return this.authService.login(input);
  }
}
