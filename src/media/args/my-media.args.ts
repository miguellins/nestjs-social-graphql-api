import { ArgsType } from "@nestjs/graphql";

import { PaginationArgs } from "@/common/args/pagination.args";

@ArgsType()
export class MyMediaArgs extends PaginationArgs {}
