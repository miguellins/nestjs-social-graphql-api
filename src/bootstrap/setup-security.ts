import type { INestApplication } from "@nestjs/common";

import helmet from "helmet";

/**
 * Bootstrap helper for security middleware
 *
 * Applies Helmet and related HTTP protections
 */

export function setupSecurity(app: INestApplication): void {
  app.use(
    helmet({
      // Configure Helmet CSP (content security policy) behavior
      contentSecurityPolicy:
        process.env.NODE_ENV === "production" ? undefined : false,
    }),
  );
}
