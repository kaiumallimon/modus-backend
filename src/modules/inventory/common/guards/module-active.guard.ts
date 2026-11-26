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
    const raw = this.reflector.getAllAndOverride<string | string[]>(
      REQUIRE_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!raw || (Array.isArray(raw) && raw.length === 0)) {
      return true;
    }

    const requiredModules = Array.isArray(raw) ? raw : [raw];
    for (const moduleId of requiredModules) {
      const active = await this.moduleRegistryService.isModuleActive(moduleId);
      if (!active) {
        throw new ForbiddenException(
          `Module "${moduleId}" is currently deactivated for this installation`,
        );
      }
    }

    return true;
  }
}
