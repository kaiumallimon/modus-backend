import { Test, TestingModule } from '@nestjs/testing';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';
import { Role } from '../users/enums/role.enum';

describe('AccessControlController', () => {
  let controller: AccessControlController;
  let mockAccessControlService: {
    getAllPermissions: jest.Mock;
    getGroupedPermissions: jest.Mock;
    findAllRoles: jest.Mock;
    getRoleStats: jest.Mock;
    findRoleById: jest.Mock;
    findRoleByIdWithUsers: jest.Mock;
    createRole: jest.Mock;
    updateRole: jest.Mock;
    deleteRole: jest.Mock;
  };

  const mockCurrentUser = {
    userId: '6b035bd0e2384111c7593a13',
    email: 'admin@modus.local',
    role: Role.SUPER_ADMIN,
  };

  const mockReq: any = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'Jest-Test' },
  };

  beforeEach(async () => {
    mockAccessControlService = {
      getAllPermissions: jest.fn().mockReturnValue([{ id: 'users.read', name: 'View Users' }]),
      getGroupedPermissions: jest.fn().mockReturnValue([
        { module: 'users', moduleName: 'User Management', permissions: [{ id: 'users.read' }] },
      ]),
      findAllRoles: jest.fn().mockResolvedValue([{ code: 'SUPER_ADMIN', name: 'Super Admin' }]),
      getRoleStats: jest.fn().mockResolvedValue({ totalRoles: 4, systemRoles: 4, customRoles: 0 }),
      findRoleById: jest.fn().mockResolvedValue({ code: 'ADMIN', name: 'Admin' }),
      findRoleByIdWithUsers: jest.fn().mockResolvedValue({
        role: { code: 'ADMIN', name: 'Admin' },
        userCount: 2,
        users: [],
      }),
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

  it('should return grouped permissions', () => {
    const groups = controller.getGroupedPermissions();
    expect(groups).toHaveLength(1);
    expect(groups[0].module).toBe('users');
  });

  it('should return roles list', async () => {
    const roles = await controller.getRoles();
    expect(roles).toEqual([{ code: 'SUPER_ADMIN', name: 'Super Admin' }]);
  });

  it('should return role stats', async () => {
    const stats = await controller.getRoleStats();
    expect(stats).toHaveProperty('totalRoles', 4);
  });

  it('should return role with users list', async () => {
    const roleWithUsers = await controller.getRole('role-123');
    expect(roleWithUsers).toHaveProperty('userCount', 2);
    expect(mockAccessControlService.findRoleByIdWithUsers).toHaveBeenCalledWith('role-123');
  });

  it('should create custom role with actor audit info', async () => {
    const dto: any = { code: 'CUSTOM', name: 'Custom' };
    const result = await controller.createRole(dto, mockCurrentUser, mockReq);
    expect(result).toEqual({ code: 'CUSTOM', name: 'Custom' });
    expect(mockAccessControlService.createRole).toHaveBeenCalledWith(
      dto,
      {
        id: mockCurrentUser.userId,
        email: mockCurrentUser.email,
        role: mockCurrentUser.role,
      },
      mockReq.ip,
      mockReq.headers['user-agent'],
    );
  });

  it('should update role with actor audit info', async () => {
    const dto: any = { name: 'Updated Name' };
    const result = await controller.updateRole('role-123', dto, mockCurrentUser, mockReq);
    expect(result).toEqual({ code: 'CUSTOM', name: 'Updated' });
    expect(mockAccessControlService.updateRole).toHaveBeenCalledWith(
      'role-123',
      dto,
      {
        id: mockCurrentUser.userId,
        email: mockCurrentUser.email,
        role: mockCurrentUser.role,
      },
      mockReq.ip,
      mockReq.headers['user-agent'],
    );
  });

  it('should delete role with actor audit info', async () => {
    const result = await controller.deleteRole('role-123', mockCurrentUser, mockReq);
    expect(result).toEqual({ success: true, message: 'Deleted' });
    expect(mockAccessControlService.deleteRole).toHaveBeenCalledWith(
      'role-123',
      {
        id: mockCurrentUser.userId,
        email: mockCurrentUser.email,
        role: mockCurrentUser.role,
      },
      mockReq.ip,
      mockReq.headers['user-agent'],
    );
  });
});
