import { registerEnumType } from "@nestjs/graphql";

import { PostKind } from "@prisma/client";

registerEnumType(PostKind, {
  name: "PostKind",
  description:
    "Represents whether a post is original content, a repost, or a quote post",
});

export { PostKind };
