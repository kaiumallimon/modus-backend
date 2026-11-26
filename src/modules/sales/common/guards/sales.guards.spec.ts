import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { ModuleActiveGuard } from '../../../inventory/common/guards/module-active.guard';
import { Role } from '../../../users/enums/role.enum';

describe('Sales Guards (Inventory Dependency & RBAC)', () => {
  const createContext = (role?: string) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: role ? { userId: 'u1', email: 'sales@modus.local', role } : undefined,
        }),
      }),
    }) as any;

  it('blocks Sales endpoints when Inventory dependency is deactivated even if Sales is active', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['sales', 'inventory']),
    } as unknown as Reflector;
    const registry = {
      isModuleActive: jest.fn(async (id: string) => id === 'sales'),
    } as any;
    const guard = new ModuleActiveGuard(reflector, registry);

    await expect(
      guard.canActivate(createContext('SUPER_ADMIN')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows Sales endpoints when both Sales and Inventory are active', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['sales', 'inventory']),
    } as unknown as Reflector;
    const registry = {
      isModuleActive: jest.fn().mockResolvedValue(true),
    } as any;
    const guard = new ModuleActiveGuard(reflector, registry);

    await expect(guard.canActivate(createContext('ADMIN'))).resolves.toBe(true);
    expect(registry.isModuleActive).toHaveBeenCalledWith('sales');
    expect(registry.isModuleActive).toHaveBeenCalledWith('inventory');
  });

  it('enforces sales RBAC permissions via PermissionsGuard', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(['sales.fulfillments.create'])
        .mockReturnValueOnce(undefined),
    } as unknown as Reflector;
    const accessControl = {
      hasPermission: jest.fn().mockResolvedValue(false),
    } as any;

    const guard = new PermissionsGuard(reflector, accessControl);
    await expect(guard.canActivate(createContext(Role.EMPLOYEE))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
