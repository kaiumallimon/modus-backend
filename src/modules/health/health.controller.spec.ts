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
              if (key === 'app.name') return 'Pharmbrew';
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

  it('should return healthy status when database is connected', () => {
    mockConnection.readyState = 1;
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('Pharmbrew');
    expect(result.dependencies.database.status).toBe('connected');
  });

  it('should throw ServiceUnavailableException when database is disconnected', () => {
    mockConnection.readyState = 0;

    expect(() => controller.check()).toThrow(ServiceUnavailableException);
  });
});
