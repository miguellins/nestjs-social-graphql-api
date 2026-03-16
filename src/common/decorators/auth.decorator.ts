import { SetMetadata } from "@nestjs/common";

/**
 * Authentication metadata decorator
 *
 * Marks resolvers as public when auth is not required
 */

// Creates a custom decorator that makes a route as public (no authentication required)
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
