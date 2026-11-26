import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { ModuleActiveGuard } from './module-active.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { Role } from '../../../users/enums/role.enum';

describe('Inventory Guards (ModuleActiveGuard & PermissionsGuard)', () => {
  const createExecutionContext = (role?: string) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { userId: 'u1', email: 'a@b.com', role } : undefined }),
      }),
    }) as any;

  describe('ModuleActiveGuard', () => {
    it('allows requests when required module is activated', async () => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue('inventory'),
      } as unknown as Reflector;
      const registry = { isModuleActive: jest.fn().mockResolvedValue(true) } as any;
      const guard = new ModuleActiveGuard(reflector, registry);

      await expect(guard.canActivate(createExecutionContext('ADMIN'))).resolves.toBe(true);
      expect(registry.isModuleActive).toHaveBeenCalledWith('inventory');
    });

    it('blocks requests with ForbiddenException when required module is deactivated', async () => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue('inventory'),
      } as unknown as Reflector;
      const registry = { isModuleActive: jest.fn().mockResolvedValue(false) } as any;
      const guard = new ModuleActiveGuard(reflector, registry);

      await expect(guard.canActivate(createExecutionContext('SUPER_ADMIN'))).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('PermissionsGuard (Inventory RBAC + AnyPermission)', () => {
    it('enforces exact @RequirePermissions for non-super-admin roles', async () => {
      const reflector = {
        getAllAndOverride: jest
          .fn()
          .mockReturnValueOnce(['inventory.products.create'])
          .mockReturnValueOnce(undefined),
      } as unknown as Reflector;
      const accessControl = {
        hasPermission: jest.fn().mockResolvedValue(false),
      } as any;

      const guard = new PermissionsGuard(reflector, accessControl);
      await expect(guard.canActivate(createExecutionContext(Role.EMPLOYEE))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows dashboard access via @RequireAnyPermission if any single inventory read perm matches', async () => {
      const reflector = {
        getAllAndOverride: jest
          .fn()
          .mockReturnValueOnce(undefined)
          .mockReturnValueOnce(['inventory.products.read', 'inventory.stock.read']),
      } as unknown as Reflector;
      const accessControl = {
        hasPermission: jest.fn(async (_role: string, perm: string) => perm === 'inventory.stock.read'),
      } as any;

      const guard = new PermissionsGuard(reflector, accessControl);
      await expect(guard.canActivate(createExecutionContext(Role.MANAGER))).resolves.toBe(true);
    });
  });
});
