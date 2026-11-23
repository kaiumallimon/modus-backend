import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { InstallationService } from './installation.service';
import {
  Installation,
  SINGLETON_INSTALLATION_KEY,
} from './schemas/installation.schema';

describe('InstallationService', () => {
  let service: InstallationService;
  let mockInstallationModel: any;

  beforeEach(async () => {
    mockInstallationModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstallationService,
        {
          provide: getModelToken(Installation.name),
          useValue: mockInstallationModel,
        },
      ],
    }).compile();

    service = module.get<InstallationService>(InstallationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrCreateInstallationState', () => {
    it('should return existing installation state if record already exists', async () => {
      const existingDoc = {
        key: SINGLETON_INSTALLATION_KEY,
        isInitialized: true,
        initializedAt: new Date(),
        version: '1.0.0',
      };

      mockInstallationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(existingDoc),
      });

      const result = await service.getOrCreateInstallationState();

      expect(mockInstallationModel.findOne).toHaveBeenCalledWith({
        key: SINGLETON_INSTALLATION_KEY,
      });
      expect(result).toBe(existingDoc);
      expect(mockInstallationModel.create).not.toHaveBeenCalled();
    });

    it('should create singleton record if no record exists', async () => {
      const createdDoc = {
        key: SINGLETON_INSTALLATION_KEY,
        isInitialized: false,
        initializedAt: null,
        version: '1.0.0',
      };

      mockInstallationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      mockInstallationModel.create.mockResolvedValue(createdDoc);

      const result = await service.getOrCreateInstallationState();

      expect(mockInstallationModel.create).toHaveBeenCalledWith({
        key: SINGLETON_INSTALLATION_KEY,
        isInitialized: false,
        initializedAt: null,
        version: '1.0.0',
      });
      expect(result).toBe(createdDoc);
    });

    it('should handle race condition (duplicate key code 11000) by querying existing document', async () => {
      const racedDoc = {
        key: SINGLETON_INSTALLATION_KEY,
        isInitialized: false,
        initializedAt: null,
        version: '1.0.0',
      };

      mockInstallationModel.findOne
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(racedDoc) });

      const duplicateError: any = new Error('E11000 duplicate key');
      duplicateError.code = 11000;
      mockInstallationModel.create.mockRejectedValue(duplicateError);

      const result = await service.getOrCreateInstallationState();

      expect(result).toBe(racedDoc);
    });
  });

  describe('isInitialized', () => {
    it('should return false when installation has not been initialized', async () => {
      mockInstallationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ isInitialized: false }),
      });

      const initialized = await service.isInitialized();
      expect(initialized).toBe(false);
    });

    it('should return true when installation has been marked as initialized', async () => {
      mockInstallationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ isInitialized: true }),
      });

      const initialized = await service.isInitialized();
      expect(initialized).toBe(true);
    });
  });

  describe('markAsInitialized', () => {
    it('should update state to isInitialized=true and save document', async () => {
      const mockDoc: any = {
        key: SINGLETON_INSTALLATION_KEY,
        isInitialized: false,
        initializedAt: null,
        version: '1.0.0',
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };

      mockInstallationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoc),
      });

      const updated = await service.markAsInitialized('1.2.0');

      expect(updated.isInitialized).toBe(true);
      expect(updated.initializedAt).toBeInstanceOf(Date);
      expect(updated.version).toBe('1.2.0');
      expect(mockDoc.save).toHaveBeenCalled();
    });
  });
});
