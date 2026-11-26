import { SetMetadata } from '@nestjs/common';

export const REQUIRE_MODULE_KEY = 'required_module';
export const RequireModule = (...moduleIds: string[]) =>
  SetMetadata(
    REQUIRE_MODULE_KEY,
    moduleIds.length === 1 ? moduleIds[0] : moduleIds,
  );
