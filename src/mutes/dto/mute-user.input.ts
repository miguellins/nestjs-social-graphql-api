import { Field, InputType, Int } from "@nestjs/graphql";

import { ArrayNotEmpty, IsEnum, IsInt, IsOptional, Min } from "class-validator";

import { MuteScope } from "@/mutes/enums/mute-scope.enum";

/** Input for creating or replacing a mute relationship. */
@InputType()
export class MuteUserInput {
  /** Identifier of the user to mute. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  userId!: number;

  /** Optional surfaces where this mute applies; omitted means all scopes. */
  @Field(() => [MuteScope], { nullable: true })
  @IsOptional()
  @ArrayNotEmpty()
  @IsEnum(MuteScope, { each: true })
  scopes?: MuteScope[];
}
