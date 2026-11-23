import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('audit.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get paginated immutable system audit logs',
    description:
      'Inspect historical administrative and security events. Audit logs are strictly append-only and cannot be altered or deleted.',
  })
  @ApiResponse({ status: 200, description: 'Paginated audit logs returned' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll(@Query() query: QueryAuditLogDto) {
    return this.auditLogService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('audit.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get single audit log entry by ID' })
  @ApiParam({ name: 'id', description: 'Audit log MongoDB ID' })
  @ApiResponse({ status: 200, description: 'Audit log entry returned' })
  @ApiResponse({ status: 404, description: 'Audit log entry not found' })
  findOne(@Param('id') id: string) {
    return this.auditLogService.findById(id);
  }
}
