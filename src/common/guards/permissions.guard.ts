import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ANY_PERMISSIONS_KEY,
  PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';
import { Role } from '../../modules/users/enums/role.enum';
import { AccessControlService } from '../../modules/access-control/access-control.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessControlService: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const anyPermissions = this.reflector.getAllAndOverride<string[]>(
      ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      (!requiredPermissions || requiredPermissions.length === 0) &&
      (!anyPermissions || anyPermissions.length === 0)
    ) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.role) {
      throw new ForbiddenException('Access denied: no user role found');
    }

    // Super Admin role always possesses unrestricted installation-wide access
    if (user.role === Role.SUPER_ADMIN) {
      return true;
    }

    if (requiredPermissions && requiredPermissions.length > 0) {
      for (const permission of requiredPermissions) {
        const granted = await this.accessControlService.hasPermission(
          user.role as string,
          permission,
        );
        if (!granted) {
          throw new ForbiddenException(
            `Access denied: missing required permission "${permission}"`,
          );
        }
      }
    }

    if (anyPermissions && anyPermissions.length > 0) {
      let grantedAny = false;
      for (const permission of anyPermissions) {
        if (
          await this.accessControlService.hasPermission(
            user.role as string,
            permission,
          )
        ) {
          grantedAny = true;
          break;
        }
      }
      if (!grantedAny) {
        throw new ForbiddenException(
          `Access denied: requires at least one of [${anyPermissions.join(', ')}]`,
        );
      }
    }

    return true;
  }
}
