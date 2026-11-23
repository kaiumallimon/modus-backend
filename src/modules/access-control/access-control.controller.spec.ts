import { Test, TestingModule } from '@nestjs/testing';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';

describe('AccessControlController', () => {
  let controller: AccessControlController;
  let mockAccessControlService: {
    getAllPermissions: jest.Mock;
    findAllRoles: jest.Mock;
    findRoleById: jest.Mock;
    createRole: jest.Mock;
    updateRole: jest.Mock;
    deleteRole: jest.Mock;
  };

  beforeEach(async () => {
    mockAccessControlService = {
      getAllPermissions: jest.fn().mockReturnValue([{ id: 'users.read', name: 'View Users' }]),
      findAllRoles: jest.fn().mockResolvedValue([{ code: 'SUPER_ADMIN', name: 'Super Admin' }]),
      findRoleById: jest.fn().mockResolvedValue({ code: 'ADMIN', name: 'Admin' }),
      createRole: jest.fn().mockResolvedValue({ code: 'CUSTOM', name: 'Custom' }),
      updateRole: jest.fn().mockResolvedValue({ code: 'CUSTOM', name: 'Updated' }),
      deleteRole: jest.fn().mockResolvedValue({ success: true, message: 'Deleted' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccessControlController],
      providers: [
        {
          provide: AccessControlService,
          useValue: mockAccessControlService,
        },
      ],
    }).compile();

    controller = module.get<AccessControlController>(AccessControlController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return permissions list', () => {
    const perms = controller.getPermissions();
    expect(perms).toEqual([{ id: 'users.read', name: 'View Users' }]);
  });

  it('should return roles list', async () => {
    const roles = await controller.getRoles();
    expect(roles).toEqual([{ code: 'SUPER_ADMIN', name: 'Super Admin' }]);
  });

  it('should create custom role', async () => {
    const dto: any = { code: 'CUSTOM', name: 'Custom' };
    const result = await controller.createRole(dto);
    expect(result).toEqual({ code: 'CUSTOM', name: 'Custom' });
    expect(mockAccessControlService.createRole).toHaveBeenCalledWith(dto);
  });
});
