import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  it('/api/v1/health (GET)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.application).toBe('Modus');
  });

  it('/api/v1/health/ready (GET)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.application).toBe('Modus');
    expect(res.body.dependencies.database.status).toBe('connected');
  });

  it('/api/v1/installation/status (GET)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/installation/status')
      .expect(200);

    expect(res.body).toHaveProperty('isInitialized');
    expect(res.body).toHaveProperty('version');
  });

  afterEach(async () => {
    await app.close();
  });
});
