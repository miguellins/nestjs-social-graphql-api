import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

import { GlobalGqlExceptionFilter } from "./common/filters/gql-exception.filter";

import helmet from "helmet";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enables global request validation + automatic input cleaning
  app.useGlobalPipes(
    new ValidationPipe({
      // Strips unknown properties
      whitelist: true,

      // Throws error on extra fields
      forbidNonWhitelisted: true,

      // Auto-transform payloads to DTO classes
      transform: true,
    }),
  );

  // Enables global exception filter for GraphQL errors
  app.useGlobalFilters(new GlobalGqlExceptionFilter());

  // Adds several HTTP headers that helps protect the app from common vulnerabilities
  app.use(
    helmet({
      // Configure Helmet CSP (content security policy) behavior
      contentSecurityPolicy:
        process.env.NODE_ENV === "production" ? undefined : false,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((err) => {
  console.error("Error during bootstrap:", err);
  process.exit(1);
});
