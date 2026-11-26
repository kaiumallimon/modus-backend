import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { ModuleActiveGuard } from '../../../inventory/common/guards/module-active.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { Role } from '../../../users/enums/role.enum';

describe('Procurement Guards (Inventory Dependency & RBAC)', () => {
  const createContext = (role?: string) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: role ? { userId: 'u1', email: 'buyer@modus.local', role } : undefined,
        }),
      }),
    }) as any;

  it('blocks Procurement endpoints if Inventory dependency is deactivated even when Procurement is active', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['procurement', 'inventory']),
    } as unknown as Reflector;
    const registry = {
      isModuleActive: jest.fn(async (id: string) => id === 'procurement'),
    } as any;
    const guard = new ModuleActiveGuard(reflector, registry);

    await expect(
      guard.canActivate(createContext('SUPER_ADMIN')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows Procurement endpoints when both Procurement and Inventory are active', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['procurement', 'inventory']),
    } as unknown as Reflector;
    const registry = {
      isModuleActive: jest.fn().mockResolvedValue(true),
    } as any;
    const guard = new ModuleActiveGuard(reflector, registry);

    await expect(guard.canActivate(createContext('ADMIN'))).resolves.toBe(true);
    expect(registry.isModuleActive).toHaveBeenCalledWith('procurement');
    expect(registry.isModuleActive).toHaveBeenCalledWith('inventory');
  });

  it('enforces procurement RBAC permissions via existing PermissionsGuard', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(['procurement.goods-receipts.confirm'])
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
