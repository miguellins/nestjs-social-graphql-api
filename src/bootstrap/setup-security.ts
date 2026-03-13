import type { INestApplication } from "@nestjs/common";

import helmet from "helmet";

/**
 * Applies global HTTP security middleware during application bootstrap
 *
 * Helmet adds defensive headers for common web vulnerabilities while keeping
 * development ergonomics intact by relaxing CSP outside production.
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
