import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ModuleRegistryService } from '../../../module-registry/module-registry.service';
import { REQUIRE_MODULE_KEY } from '../decorators/require-module.decorator';

@Injectable()
export class ModuleActiveGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRegistryService: ModuleRegistryService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<string>(
      REQUIRE_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredModule) {
      return true;
    }

    const active =
      await this.moduleRegistryService.isModuleActive(requiredModule);
    if (!active) {
      throw new ForbiddenException(
        `Module "${requiredModule}" is currently deactivated for this installation`,
      );
    }

    return true;
  }
}
