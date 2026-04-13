import { ArgsType } from "@nestjs/graphql";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";

/** Cursor-paginated query arguments for the authenticated user's bookmarks. */
@ArgsType()
export class FindMyBookmarksArgs extends CursorPaginationArgs {}
