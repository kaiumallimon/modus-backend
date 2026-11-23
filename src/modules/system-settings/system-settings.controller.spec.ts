import { Test, TestingModule } from '@nestjs/testing';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';

describe('SystemSettingsController', () => {
  let controller: SystemSettingsController;
  let mockSettingsService: {
    getSettings: jest.Mock;
    updateSettings: jest.Mock;
  };

  beforeEach(async () => {
    mockSettingsService = {
      getSettings: jest.fn().mockResolvedValue({ defaultTimezone: 'UTC' }),
      updateSettings: jest.fn().mockResolvedValue({ defaultTimezone: 'America/New_York' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemSettingsController],
      providers: [
        {
          provide: SystemSettingsService,
          useValue: mockSettingsService,
        },
      ],
    }).compile();

    controller = module.get<SystemSettingsController>(SystemSettingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return system settings', async () => {
    const result = await controller.getSettings();
    expect(result).toEqual({ defaultTimezone: 'UTC' });
    expect(mockSettingsService.getSettings).toHaveBeenCalled();
  });

  it('should update system settings', async () => {
    const dto = { defaultTimezone: 'America/New_York' };
    const userPayload: any = { userId: 'u1', email: 'admin@modus.local', role: 'SUPER_ADMIN' };
    const req: any = { ip: '127.0.0.1', headers: { 'user-agent': 'test-agent' } };

    const result = await controller.updateSettings(dto, userPayload, req);
    expect(result).toEqual({ defaultTimezone: 'America/New_York' });
  });
});
