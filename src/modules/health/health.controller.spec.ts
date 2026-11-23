import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let mockConnection: { readyState: number };

  beforeEach(async () => {
    mockConnection = { readyState: 1 };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'app.name') return 'Modus';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check (GET /health)', () => {
    it('should return process ok status with application name', () => {
      const result = controller.check();
      expect(result).toEqual({
        status: 'ok',
        application: 'Modus',
      });
    });
  });

  describe('ready (GET /health/ready)', () => {
    it('should return ready status when database is connected', () => {
      mockConnection.readyState = 1;
      const result = controller.ready();

      expect(result.status).toBe('ok');
      expect(result.application).toBe('Modus');
      expect(result.dependencies.database.status).toBe('connected');
    });

    it('should throw ServiceUnavailableException when database is disconnected', () => {
      mockConnection.readyState = 0;

      expect(() => controller.ready()).toThrow(ServiceUnavailableException);
    });
  });
});
