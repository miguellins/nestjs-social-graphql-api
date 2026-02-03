import { SetMetadata } from "@nestjs/common";

// Creates a custom decorator that makes a route as public (no authentication required)
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
