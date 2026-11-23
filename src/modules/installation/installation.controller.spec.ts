import { Test, TestingModule } from '@nestjs/testing';
import { InstallationController } from './installation.controller';
import { InstallationService } from './installation.service';

describe('InstallationController', () => {
  let controller: InstallationController;
  let mockInstallationService: {
    getOrCreateInstallationState: jest.Mock;
  };

  beforeEach(async () => {
    mockInstallationService = {
      getOrCreateInstallationState: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InstallationController],
      providers: [
        {
          provide: InstallationService,
          useValue: mockInstallationService,
        },
      ],
    }).compile();

    controller = module.get<InstallationController>(InstallationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStatus (GET /installation/status)', () => {
    it('should return initialization status, timestamp, and version', async () => {
      const now = new Date();
      mockInstallationService.getOrCreateInstallationState.mockResolvedValue({
        isInitialized: true,
        initializedAt: now,
        version: '1.0.0',
      });

      const result = await controller.getStatus();

      expect(result).toEqual({
        isInitialized: true,
        initializedAt: now,
        version: '1.0.0',
      });
      expect(
        mockInstallationService.getOrCreateInstallationState,
      ).toHaveBeenCalled();
    });
  });
});
