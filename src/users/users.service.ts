import { Injectable, Logger, NotFoundException } from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { decodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";
import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import {
  buildChronologicalCursorFilter,
  buildCursorPage,
  normalizeCursorTake,
  type CursorPageResult,
} from "@/common/pagination/cursor-pagination";

import { type SafeUserDTO } from "@/users/dto/safe-user.dto";
import { MyPrivacySettings } from "@/users/models/my-privacy-settings.model";
import { UserAccountStateService } from "@/users/user-account-state.service";
import { UserWriteService } from "@/users/user-write.service";
import {
  type CreateUserCommand,
  type UpdateMyProfileCommand,
  type UpdateUserCommand,
} from "@/users/schemas/user-write.schema";
import { CreatedUserDTO } from "@/users/dto/created-user.dto";
import {
  updateMyPrivacySettingCommandSchema,
  type ReactivateUserCommand,
  type SuspendUserCommand,
  type UpdateMyPrivacySettingCommand,
} from "@/users/schemas/privacy-account-state.schema";
import { UserProfileReadService } from "@/users/user-profile-read.service";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { PrismaService } from "@/prisma/prisma.service";

type PaginationParams = {
  after?: string;
  first?: number;
  orderBy?: ChronologicalOrder;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly userProfileRead: UserProfileReadService,
    private readonly userWriteService: UserWriteService,
    private readonly userAccountStateService: UserAccountStateService,
  ) {}

  /** Lists users with bounded pagination and cache support. */
  async findUsers(
    params?: PaginationParams,
  ): Promise<CursorPageResult<SafeUserDTO>> {
    const limit = normalizeCursorTake(params?.first);
    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderby);

    const v = await this.cacheHelper.getVersion("v:user:list");
    const cacheKey = `user:list:v=${v}:first=${limit}:after=${params?.after ?? "none"}:order=${orderby}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.userProfileRead.findUsers({
          limit,
          orderBy: orderby,
          cursorFilter,
          sortDirection: toSortDirection(orderby),
        });

        return buildCursorPage(rows, limit);
      },
      60_000,
    );
  }

  /** Returns one viewer-aware safe user profile by id. */
  async getUser(id: number, viewer?: AuthenticatedUser): Promise<SafeUserDTO> {
    return this.userProfileRead.getUser(id, viewer);
  }

  /** Returns one viewer-aware safe user profile by username. */
  async getUserByUsername(
    username: string,
    viewer?: AuthenticatedUser,
  ): Promise<SafeUserDTO> {
    return this.userProfileRead.getUserByUsername(username, viewer);
  }

  /** Returns the authenticated owner's profile without exposing email. */
  async getMyProfile(currentUserId: number) {
    return this.userProfileRead.getMyProfile(currentUserId);
  }

  /** Delegates user creation to the write collaborator. */
  async createUser(input: CreateUserCommand): Promise<CreatedUserDTO> {
    return this.userWriteService.createUser(input);
  }

  /** Delegates account field updates to the write collaborator. */
  async updateUser(
    input: UpdateUserCommand,
    currentUserId: number,
  ): Promise<SafeUserDTO> {
    return this.userWriteService.updateUser(input, currentUserId);
  }

  /** Delegates public profile text updates to the write collaborator. */
  async updateMyProfile(
    input: UpdateMyProfileCommand,
    currentUserId: number,
  ): Promise<SafeUserDTO> {
    return this.userWriteService.updateMyProfile(input, currentUserId);
  }

  /** Returns the authenticated user's privacy and account-state settings. */
  async getMyPrivacySettings(
    currentUserId: number,
  ): Promise<MyPrivacySettings> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        privacySetting: true,
        accountState: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return {
      message: "Privacy settings loaded successfully",
      privacySetting: user.privacySetting,
      accountState: user.accountState,
    };
  }

  /** Updates the authenticated user's privacy setting and invalidates visibility caches. */
  async updateMyPrivacySetting(
    input: UpdateMyPrivacySettingCommand,
    currentUserId: number,
  ): Promise<MyPrivacySettings> {
    const data = this.parseUpdateMyPrivacySettingInput(input);

    const existing = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        id: true,
        username: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("User not found");
    }

    const updated = await this.prisma.user.update({
      where: { id: currentUserId },
      data: {
        privacySetting: data.privacySetting,
      },
      select: {
        privacySetting: true,
        accountState: true,
      },
    });

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate visibility caches after updating privacy for user ${currentUserId}`,
      async () => {
        await this.userAccountStateService.invalidateUserVisibilityCaches(
          currentUserId,
          existing.username,
        );
      },
    );

    return {
      message: "Privacy setting updated successfully",
      privacySetting: updated.privacySetting,
      accountState: updated.accountState,
    };
  }

  /** Delegates user deletion to the account-state collaborator. */
  async deleteUser(currentUserId: number): Promise<MessageResponse> {
    return this.userAccountStateService.deleteUser(currentUserId);
  }

  /** Delegates user suspension to the account-state collaborator. */
  async suspendUser(
    input: SuspendUserCommand,
    currentUser: AuthenticatedUser,
  ): Promise<MessageResponse> {
    return this.userAccountStateService.suspendUser(input, currentUser);
  }

  /** Delegates user reactivation to the account-state collaborator. */
  async reactivateUser(
    input: ReactivateUserCommand,
    currentUser: AuthenticatedUser,
  ): Promise<MessageResponse> {
    return this.userAccountStateService.reactivateUser(input, currentUser);
  }

  /** Parses and normalizes privacy-setting updates for the current user. */
  private parseUpdateMyPrivacySettingInput(
    input: UpdateMyPrivacySettingCommand,
  ) {
    return parseWithBadRequest(
      updateMyPrivacySettingCommandSchema,
      input,
      "Invalid privacy setting input",
    );
  }
}
