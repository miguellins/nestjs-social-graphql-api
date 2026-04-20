import { ArgsType } from "@nestjs/graphql";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";

/** Cursor-paginated query arguments for the authenticated user's home feed. */
@ArgsType()
export class HomeFeedArgs extends CursorPaginationArgs {}
