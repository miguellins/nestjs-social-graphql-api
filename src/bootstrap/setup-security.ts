import type { INestApplication } from "@nestjs/common";

import helmet from "helmet";

/** Sets up helmet-based HTTP security middleware for the NestJS app. */
export function setupSecurity(app: INestApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production" ? undefined : false,
    }),
  );
}
