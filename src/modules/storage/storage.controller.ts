import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  UploadedFile,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import 'multer';
import { StorageService } from './storage.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';

@ApiTags('Storage & CDN')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('stats')
  @RequirePermissions('cdn.read')
  @ApiOperation({
    summary: 'Get Cloudflare R2 CDN storage usage statistics and metrics',
  })
  @ApiResponse({ status: 200, description: 'Storage metrics returned' })
  @ApiResponse({ status: 403, description: 'Forbidden without cdn.read permission' })
  getStats() {
    return this.storageService.getStats();
  }

  @Get('objects')
  @RequirePermissions('cdn.read')
  @ApiOperation({
    summary: 'List objects and folders in the Cloudflare R2 bucket',
  })
  @ApiResponse({ status: 200, description: 'Objects returned' })
  listObjects(
    @Query('prefix') prefix?: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
    @Query('search') search?: string,
  ) {
    return this.storageService.listObjects({ prefix, limit, cursor, search });
  }

  @Post('upload')
  @RequirePermissions('cdn.manage')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload an asset file into the Cloudflare CDN bucket',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        folder: {
          type: 'string',
          example: 'assets',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  async uploadAsset(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
    @CurrentUser('userId') userId?: string,
    @CurrentUser('email') userEmail?: string,
    @Req() req?: Request,
  ) {
    const result = await this.storageService.uploadAsset(file, folder || 'assets');

    if (userId) {
      await this.auditLogService.record({
        actor: {
          id: userId,
          email: userEmail || 'unknown',
        },
        action: 'CDN_ASSET_UPLOAD',
        resource: 'cdn',
        resourceId: result.key,
        description: `Uploaded CDN asset "${result.name}" (${result.formattedSize}) to ${result.key}`,
        ipAddress: req?.ip || req?.socket?.remoteAddress,
        userAgent: req?.headers ? (req.headers['user-agent'] as string) : undefined,
      });
    }

    return result;
  }

  @Delete('objects')
  @RequirePermissions('cdn.manage')
  @ApiOperation({
    summary: 'Delete one or more objects from the Cloudflare R2 bucket',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        keys: {
          type: 'array',
          items: { type: 'string' },
          example: ['assets/sample.png'],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Objects deleted successfully' })
  async deleteObjects(
    @Body('keys') keys: string[],
    @CurrentUser('userId') userId?: string,
    @CurrentUser('email') userEmail?: string,
    @Req() req?: Request,
  ) {
    const result = await this.storageService.deleteObjects(keys || []);

    if (userId) {
      await this.auditLogService.record({
        actor: {
          id: userId,
          email: userEmail || 'unknown',
        },
        action: 'CDN_ASSET_DELETE',
        resource: 'cdn',
        description: `Deleted ${result.deleted} asset(s) from CDN storage: ${(keys || []).slice(0, 3).join(', ')}`,
        ipAddress: req?.ip || req?.socket?.remoteAddress,
        userAgent: req?.headers ? (req.headers['user-agent'] as string) : undefined,
      });
    }

    return result;
  }
}
