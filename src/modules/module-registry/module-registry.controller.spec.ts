import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRegistryController } from './module-registry.controller';
import { ModuleRegistryService } from './module-registry.service';

describe('ModuleRegistryController', () => {
  let controller: ModuleRegistryController;
  let mockModuleService: {
    getModules: jest.Mock;
    getModuleById: jest.Mock;
    setModuleActivation: jest.Mock;
  };

  beforeEach(async () => {
    mockModuleService = {
      getModules: jest.fn().mockResolvedValue([{ id: 'auth', isCore: true }]),
      getModuleById: jest.fn().mockResolvedValue({ id: 'auth', name: 'Auth' }),
      setModuleActivation: jest.fn().mockResolvedValue({ id: 'crm', isActivated: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModuleRegistryController],
      providers: [
        {
          provide: ModuleRegistryService,
          useValue: mockModuleService,
        },
      ],
    }).compile();

    controller = module.get<ModuleRegistryController>(ModuleRegistryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return registered modules', async () => {
    const result = await controller.getModules();
    expect(result).toEqual([{ id: 'auth', isCore: true }]);
    expect(mockModuleService.getModules).toHaveBeenCalled();
  });

  it('should return module by ID', async () => {
    const result = await controller.getModule('auth');
    expect(result).toEqual({ id: 'auth', name: 'Auth' });
    expect(mockModuleService.getModuleById).toHaveBeenCalledWith('auth');
  });

  it('should toggle module activation', async () => {
    const dto = { isActivated: true };
    const userPayload: any = { userId: 'u1', email: 'admin@modus.local', role: 'SUPER_ADMIN' };
    const req: any = { ip: '127.0.0.1', headers: { 'user-agent': 'test-agent' } };

    const result = await controller.setModuleActivation('crm', dto, userPayload, req);
    expect(result).toEqual({ id: 'crm', isActivated: true });
    expect(mockModuleService.setModuleActivation).toHaveBeenCalledWith(
      'crm',
      true,
      { id: 'u1', email: 'admin@modus.local', role: 'SUPER_ADMIN' },
      '127.0.0.1',
      'test-agent',
    );
  });
});
