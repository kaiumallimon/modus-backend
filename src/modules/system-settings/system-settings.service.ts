import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SINGLETON_SYSTEM_SETTINGS_KEY,
  SystemSettings,
  SystemSettingsDocument,
} from './schemas/system-settings.schema';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);

  constructor(
    @InjectModel(SystemSettings.name)
    private readonly settingsModel: Model<SystemSettingsDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getOrCreateSettings(
    initialData?: Partial<SystemSettings>,
  ): Promise<SystemSettingsDocument> {
    let settings = await this.settingsModel
      .findOne({ key: SINGLETON_SYSTEM_SETTINGS_KEY })
      .exec();

    if (!settings) {
      try {
        settings = await this.settingsModel.create({
          key: SINGLETON_SYSTEM_SETTINGS_KEY,
          defaultTimezone: initialData?.defaultTimezone || 'UTC',
          defaultLocale: initialData?.defaultLocale || 'en-US',
          defaultCurrency: initialData?.defaultCurrency || 'USD',
          dateFormat: initialData?.dateFormat || 'YYYY-MM-DD',
          timeFormat: initialData?.timeFormat || 'HH:mm:ss',
          defaultPaginationLimit: initialData?.defaultPaginationLimit || 10,
          allowPasswordReset:
            initialData?.allowPasswordReset !== undefined
              ? initialData.allowPasswordReset
              : true,
          sessionTimeoutMinutes: initialData?.sessionTimeoutMinutes || 60,
          customPreferences: initialData?.customPreferences || {},
        });
        this.logger.log('Created singleton system settings record');
      } catch (err: any) {
        if (err.code === 11000) {
          settings = await this.settingsModel
            .findOne({ key: SINGLETON_SYSTEM_SETTINGS_KEY })
            .exec();
        } else {
          throw err;
        }
      }
    }

    return settings!;
  }

  async getSettings(): Promise<SystemSettingsDocument> {
    return this.getOrCreateSettings();
  }

  async updateSettings(
    dto: UpdateSystemSettingsDto,
    actor?: { id: string; email: string; humanId?: string; role?: string },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SystemSettingsDocument> {
    const settings = await this.getOrCreateSettings();

    if (dto.defaultTimezone !== undefined) {
      settings.defaultTimezone = dto.defaultTimezone.trim();
    }
    if (dto.defaultLocale !== undefined) {
      settings.defaultLocale = dto.defaultLocale.trim();
    }
    if (dto.defaultCurrency !== undefined) {
      settings.defaultCurrency = dto.defaultCurrency.toUpperCase().trim();
    }
    if (dto.dateFormat !== undefined) {
      settings.dateFormat = dto.dateFormat.trim();
    }
    if (dto.timeFormat !== undefined) {
      settings.timeFormat = dto.timeFormat.trim();
    }
    if (dto.defaultPaginationLimit !== undefined) {
      settings.defaultPaginationLimit = dto.defaultPaginationLimit;
    }
    if (dto.allowPasswordReset !== undefined) {
      settings.allowPasswordReset = dto.allowPasswordReset;
    }
    if (dto.sessionTimeoutMinutes !== undefined) {
      settings.sessionTimeoutMinutes = dto.sessionTimeoutMinutes;
    }

    if (dto.customPreferences !== undefined) {
      // Disallow storing keys that look like secrets or tokens
      const forbiddenPatterns = ['secret', 'token', 'password', 'key', 'auth'];
      for (const prop of Object.keys(dto.customPreferences)) {
        const lowerProp = prop.toLowerCase();
        if (forbiddenPatterns.some((pattern) => lowerProp.includes(pattern))) {
          throw new BadRequestException(
            `Property "${prop}" cannot be stored in custom preferences: secret names are disallowed`,
          );
        }
      }
      settings.customPreferences = {
        ...settings.customPreferences,
        ...dto.customPreferences,
      };
    }

    const saved = await settings.save();

    if (actor) {
      await this.auditLogService.record({
        actor,
        action: 'SYSTEM_SETTINGS_UPDATE',
        resource: 'settings',
        resourceId: saved._id.toString(),
        description: 'System application settings updated',
        metadata: { updatedFields: Object.keys(dto) },
        ipAddress,
        userAgent,
      });
    }

    return saved;
  }
}
