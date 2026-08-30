import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Twilio posts webhooks as application/x-www-form-urlencoded. Nest enables
  // express.json() on its own, but urlencoded has to be turned on explicitly.
  const express = await import('express');
  app.use(express.urlencoded({ extended: false }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const config = app.get(AppConfigService);
  await app.listen(config.port);

  new Logger('Bootstrap').log(
    `Listening on :${config.port} ` +
      `(sms=${config.smsProvider}, llm=${config.llmProvider})`,
  );
}

void bootstrap();
