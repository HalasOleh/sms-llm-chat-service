import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import express from 'express';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { MockSmsProvider } from '../src/sms/providers/mock-sms.provider';

export interface Harness {
  app: INestApplication;
  /** Typed server: getHttpServer() returns any and pollutes every test. */
  server: Server;
  sms: MockSmsProvider;
  dataSource: DataSource;
  /** Lets the event handler finish — it runs after the webhook response. */
  waitForProcessing: () => Promise<void>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  // Mirrors main.ts: without urlencoded the Twilio format cannot be parsed.
  app.use(express.urlencoded({ extended: false }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.init();

  const sms = app.get(MockSmsProvider);
  const dataSource = app.get(DataSource);

  return {
    app,
    server: app.getHttpServer() as Server,
    sms,
    dataSource,
    // Processing goes through the in-process bus after the HTTP response, so
    // a test has to let it finish. The microtask queue plus a short timer
    // tick is enough while the providers are mocked and instant.
    waitForProcessing: () => new Promise((resolve) => setTimeout(resolve, 50)),
    reset: async (): Promise<void> => {
      sms.reset();
      await dataSource.query('TRUNCATE TABLE conversations');
    },
    close: async (): Promise<void> => {
      await app.close();
    },
  };
}
