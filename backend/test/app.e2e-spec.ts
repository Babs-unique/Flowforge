import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.JWT_ACCESS_SECRET ??=
      'e2e-access-secret-that-is-at-least-32-bytes';
    process.env.JWT_REFRESH_SECRET ??=
      'e2e-refresh-secret-that-is-at-least-32-bytes';
    const { AppModule } = await import('../src/app.module.js');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Welcome to flowforge API!');
  });

  it('limits requests globally per client IP', async () => {
    const statuses: number[] = [];

    for (let index = 0; index < 101; index += 1) {
      const response = await request(app.getHttpServer()).get('/');
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 100).every((status) => status === 200)).toBe(true);
    expect(statuses[100]).toBe(429);
  });

  afterEach(async () => {
    await app.close();
  });
});
