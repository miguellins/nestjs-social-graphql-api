import { ArgsType } from "@nestjs/graphql";

import { PaginationArgs } from "@/common/args/pagination.args";

/**
 * GraphQL args for follow queries
 *
 * Validates the target user id and list options
 */

@ArgsType()
export class FindFollowsArgs extends PaginationArgs {}
