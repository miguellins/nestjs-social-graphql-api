import { ArgsType } from "@nestjs/graphql";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";

@ArgsType()
export class FindFollowsArgs extends CursorPaginationArgs {}
