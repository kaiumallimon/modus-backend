import { Test, TestingModule } from '@nestjs/testing';
import { InstallationController } from './installation.controller';
import { InstallationService } from './installation.service';

describe('InstallationController', () => {
  let controller: InstallationController;
  let mockInstallationService: {
    getOrCreateInstallationState: jest.Mock;
    setupInstallation: jest.Mock;
  };

  beforeEach(async () => {
    mockInstallationService = {
      getOrCreateInstallationState: jest.fn(),
      setupInstallation: jest.fn(),
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
        initialized: true,
        setupRequired: false,
        isInitialized: true,
        initializedAt: now,
        version: '1.0.0',
      });
      expect(
        mockInstallationService.getOrCreateInstallationState,
      ).toHaveBeenCalled();
    });
  });

  describe('setup (POST /installation/setup)', () => {
    it('should delegate setupInstallation to service', async () => {
      const dto: any = {
        administrator: { email: 'admin@modus.local' },
        organization: { name: 'Modus Org' },
      };
      mockInstallationService.setupInstallation.mockResolvedValue({
        success: true,
        message: 'Setup done',
      });

      const result = await controller.setup(dto);

      expect(mockInstallationService.setupInstallation).toHaveBeenCalledWith(
        dto,
        undefined,
        undefined,
      );
      expect(result).toEqual({ success: true, message: 'Setup done' });
    });
  });
});
