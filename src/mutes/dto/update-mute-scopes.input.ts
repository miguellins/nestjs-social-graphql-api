import { Field, InputType, Int } from "@nestjs/graphql";

import { ArrayNotEmpty, IsEnum, IsInt, Min } from "class-validator";

import { MuteScope } from "@/mutes/enums/mute-scope.enum";

/** Input for replacing the active scopes on an existing mute relationship. */
@InputType()
export class UpdateMuteScopesInput {
  /** Identifier of the muted user whose scopes should be replaced. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  userId!: number;

  /** Non-empty replacement set of surfaces where this mute applies. */
  @Field(() => [MuteScope])
  @ArrayNotEmpty()
  @IsEnum(MuteScope, { each: true })
  scopes!: MuteScope[];
}
