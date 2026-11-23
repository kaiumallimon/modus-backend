import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  OrganizationSettings,
  OrganizationSettingsDocument,
  SINGLETON_ORGANIZATION_KEY,
} from './schemas/organization.schema';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    @InjectModel(OrganizationSettings.name)
    private readonly orgModel: Model<OrganizationSettingsDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getOrCreateSettings(
    initialData?: Partial<OrganizationSettings>,
  ): Promise<OrganizationSettingsDocument> {
    let settings = await this.orgModel
      .findOne({ key: SINGLETON_ORGANIZATION_KEY })
      .exec();

    if (!settings) {
      try {
        settings = await this.orgModel.create({
          key: SINGLETON_ORGANIZATION_KEY,
          name: initialData?.name || 'Modus Organization',
          legalName: initialData?.legalName || '',
          logo: initialData?.logo || null,
          email: initialData?.email || 'contact@modus.local',
          phone: initialData?.phone || '',
          website: initialData?.website || '',
          address: initialData?.address || {},
          currency: initialData?.currency || 'USD',
          timezone: initialData?.timezone || 'UTC',
          locale: initialData?.locale || 'en-US',
        });
        this.logger.log('Created singleton organization settings record');
      } catch (err: any) {
        if (err.code === 11000) {
          settings = await this.orgModel
            .findOne({ key: SINGLETON_ORGANIZATION_KEY })
            .exec();
        } else {
          throw err;
        }
      }
    }

    return settings!;
  }

  async getSettings(): Promise<OrganizationSettingsDocument> {
    return this.getOrCreateSettings();
  }

  async updateSettings(
    dto: UpdateOrganizationDto,
    actor?: { id: string; email: string; humanId?: string; role?: string },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<OrganizationSettingsDocument> {
    const settings = await this.getOrCreateSettings();

    if (dto.name !== undefined) settings.name = dto.name.trim();
    if (dto.legalName !== undefined) settings.legalName = dto.legalName.trim();
    if (dto.logo !== undefined) settings.logo = dto.logo.trim() || null;
    if (dto.email !== undefined) settings.email = dto.email.toLowerCase().trim();
    if (dto.phone !== undefined) settings.phone = dto.phone.trim();
    if (dto.website !== undefined) settings.website = dto.website.trim();
    if (dto.currency !== undefined) settings.currency = dto.currency.toUpperCase().trim();
    if (dto.timezone !== undefined) settings.timezone = dto.timezone.trim();
    if (dto.locale !== undefined) settings.locale = dto.locale.trim();

    if (dto.address) {
      settings.address = {
        street: dto.address.street !== undefined ? dto.address.street.trim() : settings.address.street,
        city: dto.address.city !== undefined ? dto.address.city.trim() : settings.address.city,
        state: dto.address.state !== undefined ? dto.address.state.trim() : settings.address.state,
        postalCode: dto.address.postalCode !== undefined ? dto.address.postalCode.trim() : settings.address.postalCode,
        country: dto.address.country !== undefined ? dto.address.country.trim() : settings.address.country,
      };
    }

    const saved = await settings.save();

    if (actor) {
      await this.auditLogService.record({
        actor,
        action: 'ORGANIZATION_SETTINGS_UPDATE',
        resource: 'organization',
        resourceId: saved._id.toString(),
        description: `Organization profile updated: ${saved.name}`,
        metadata: { updatedFields: Object.keys(dto) },
        ipAddress,
        userAgent,
      });
    }

    return saved;
  }
}
