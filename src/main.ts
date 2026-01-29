import { ValidationPipe } from "@nestjs/common";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import helmet from "helmet";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enables global request validation + automatic input cleaning
  app.useGlobalPipes(
    new ValidationPipe({
      // strips unknown properties
      whitelist: true,

      // throws error on extra fields
      forbidNonWhitelisted: true,

      // auto-transform payloads to DTO classes
      transform: true,
    }),
  );

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
bootstrap();
