import { SetMetadata } from "@nestjs/common";

/**
 * Marks a GraphQL resolver or route as public (bypassing global auth guards).
 *
 * Usage:
 *   @Public()
 *   someQueryOrMutation(...) { ... }
 *
 * The accompanying IS_PUBLIC_KEY metadata is checked by the JWT guard
 * to optionally allow unauthenticated access.
 */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
