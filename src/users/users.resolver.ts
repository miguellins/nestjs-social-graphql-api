import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";
import { Public, Roles } from "@/common/decorators/auth.decorator";

import { UpdateMyPrivacySettingInput } from "@/users/dto/update-my-privacy-setting.input";
import { GetUserByUsernameArgs } from "@/users/args/get-user-by-username.args";
import { MyPrivacySettings } from "@/users/models/my-privacy-settings.model";
import { UpdateMyProfileInput } from "@/users/dto/update-my-profile.input";
import { ReactivateUserInput } from "@/users/dto/reactivate-user.input";
import { SuspendUserInput } from "@/users/dto/suspend-user.input";
import { CreatedUser } from "@/users/models/created-user.model";
import { CreateUserInput } from "@/users/dto/create-user.input";
import { UpdateUserInput } from "@/users/dto/update-user.input";
import { MODERATION_ROLES } from "@/users/enums/user-role.enum";
import { MyProfile } from "@/users/models/my-profile.model";
import { SafeUser } from "@/users/models/safe-user.model";
import { UserPage } from "@/users/models/user-page.model";
import { UsersService } from "@/users/users.service";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

@Resolver(() => SafeUser)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => UserPage, { name: "users" })
  async users(@Args() args: CursorPaginationArgs) {
    return this.usersService.findUsers(args);
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.READ })
  @Query(() => SafeUser, { name: "userById" })
  async userById(
    @Args("id", { type: () => Int }) id: number,
    @CurrentUser() user: AuthenticatedUser | null = null,
  ): Promise<SafeUser> {
    return this.usersService.getUser(id, user ?? undefined);
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.READ })
  @Query(() => SafeUser, { name: "userByUsername" })
  async userByUsername(
    @Args() args: GetUserByUsernameArgs,
    @CurrentUser() user: AuthenticatedUser | null = null,
  ): Promise<SafeUser> {
    return this.usersService.getUserByUsername(
      args.username,
      user ?? undefined,
    );
  }

  @Throttle({ default: THROTTLE_LIMITS.READ })
  @Query(() => MyProfile, { name: "myProfile" })
  async myProfile(@CurrentUser() user: { id: number }): Promise<MyProfile> {
    return this.usersService.getMyProfile(user.id);
  }

  // Set to Public
  @Public()
  @Throttle({ default: THROTTLE_LIMITS.SIGNUP })
  @Mutation(() => CreatedUser, { name: "createUser" })
  async createUser(
    @Args("input") input: CreateUserInput,
  ): Promise<CreatedUser> {
    return this.usersService.createUser(input);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => SafeUser, { name: "updateMe" })
  async updateMe(
    @Args("input") input: UpdateUserInput,
    @CurrentUser() user: { id: number },
  ): Promise<SafeUser> {
    return this.usersService.updateUser(input, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => SafeUser, { name: "updateMyProfile" })
  async updateMyProfile(
    @Args("input") input: UpdateMyProfileInput,
    @CurrentUser() user: { id: number },
  ): Promise<SafeUser> {
    return this.usersService.updateMyProfile(input, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.READ })
  @Query(() => MyPrivacySettings, { name: "myPrivacySettings" })
  async myPrivacySettings(
    @CurrentUser() user: { id: number },
  ): Promise<MyPrivacySettings> {
    return this.usersService.getMyPrivacySettings(user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MyPrivacySettings, { name: "updateMyPrivacySetting" })
  async updateMyPrivacySetting(
    @Args("input") input: UpdateMyPrivacySettingInput,
    @CurrentUser() user: { id: number },
  ): Promise<MyPrivacySettings> {
    return this.usersService.updateMyPrivacySetting(input, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.DESTRUCTIVE })
  @Mutation(() => MessageResponse, { name: "deleteMe" })
  async deleteMe(
    @CurrentUser() user: { id: number },
  ): Promise<MessageResponse> {
    return this.usersService.deleteUser(user.id);
  }

  @Roles(...MODERATION_ROLES)
  @Throttle({ default: THROTTLE_LIMITS.DESTRUCTIVE })
  @Mutation(() => MessageResponse, { name: "suspendUser" })
  async suspendUser(
    @Args("input") input: SuspendUserInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    return this.usersService.suspendUser(input, user);
  }

  @Roles(...MODERATION_ROLES)
  @Throttle({ default: THROTTLE_LIMITS.DESTRUCTIVE })
  @Mutation(() => MessageResponse, { name: "reactivateUser" })
  async reactivateUser(
    @Args("input") input: ReactivateUserInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    return this.usersService.reactivateUser(input, user);
  }
}
