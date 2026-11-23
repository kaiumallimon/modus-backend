import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Installation,
  InstallationDocument,
  SINGLETON_INSTALLATION_KEY,
} from './schemas/installation.schema';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { AccessControlService } from '../access-control/access-control.service';
import { OrganizationService } from '../organization/organization.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { ModuleRegistryService } from '../module-registry/module-registry.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { InstallationSetupDto } from './dto/installation-setup.dto';
import { Role } from '../users/enums/role.enum';

@Injectable()
export class InstallationService {
  private readonly logger = new Logger(InstallationService.name);

  constructor(
    @InjectModel(Installation.name)
    private readonly installationModel: Model<InstallationDocument>,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly accessControlService: AccessControlService,
    private readonly organizationService: OrganizationService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly moduleRegistryService: ModuleRegistryService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getOrCreateInstallationState(): Promise<InstallationDocument> {
    let state = await this.installationModel
      .findOne({ key: SINGLETON_INSTALLATION_KEY })
      .exec();

    if (!state) {
      try {
        state = await this.installationModel.create({
          key: SINGLETON_INSTALLATION_KEY,
          isInitialized: false,
          initializedAt: null,
          version: '1.0.0',
        });
        this.logger.log('Initialized single installation state record in database');
      } catch (err: any) {
        // Handle race condition if two calls happen simultaneously
        if (err.code === 11000) {
          state = await this.installationModel
            .findOne({ key: SINGLETON_INSTALLATION_KEY })
            .exec();
        } else {
          throw err;
        }
      }
    }

    return state!;
  }

  async isInitialized(): Promise<boolean> {
    const state = await this.getOrCreateInstallationState();
    return state.isInitialized;
  }

  async markAsInitialized(version = '1.0.0'): Promise<InstallationDocument> {
    const state = await this.getOrCreateInstallationState();
    state.isInitialized = true;
    state.initializedAt = new Date();
    state.version = version;
    return state.save();
  }

  async setupInstallation(
    dto: InstallationSetupDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // 1. Invariant: setup can only be executed before initialization
    const state = await this.getOrCreateInstallationState();
    if (state.isInitialized) {
      throw new ForbiddenException(
        'Installation has already been completed. Repeated setup is prohibited.',
      );
    }

    // 2. Validate email is not already taken
    const existingUser = await this.usersService.findByEmail(
      dto.administrator.email,
    );
    if (existingUser) {
      throw new ConflictException(
        `Email "${dto.administrator.email}" is already registered.`,
      );
    }

    // 3. Initialize default roles & permissions
    await this.accessControlService.initializeDefaultRolesAndPermissions();

    // 4. Initialize core modules
    await this.moduleRegistryService.initializeCoreModules();

    // 5. Initialize organization settings
    const org = await this.organizationService.getOrCreateSettings(
      dto.organization,
    );

    // 6. Initialize system settings
    await this.systemSettingsService.getOrCreateSettings({
      defaultCurrency: dto.organization.currency || 'USD',
      defaultTimezone: dto.organization.timezone || 'UTC',
      defaultLocale: dto.organization.locale || 'en-US',
    });

    // 7. Create Super Admin user
    const humanId = await this.usersService.generateUniqueHumanId();
    const passwordHash = await this.authService.hashData(
      dto.administrator.password,
    );
    const adminUser = await this.usersService.create({
      humanId,
      email: dto.administrator.email.toLowerCase().trim(),
      passwordHash,
      firstName: dto.administrator.firstName.trim(),
      lastName: dto.administrator.lastName.trim(),
      role: Role.SUPER_ADMIN,
      isActive: true,
      hashedRefreshToken: null,
    });

    // 8. Generate auth tokens for admin
    const tokens = await this.authService.generateTokens(
      adminUser._id.toString(),
      adminUser.email,
      adminUser.role,
    );
    const hashedRefreshToken = await this.authService.hashData(
      tokens.refreshToken,
    );
    await this.usersService.updateHashedRefreshToken(
      adminUser._id.toString(),
      hashedRefreshToken,
    );

    // 9. Mark installation as initialized
    await this.markAsInitialized('1.0.0');

    // 10. Record in audit log
    await this.auditLogService.record({
      actor: {
        id: adminUser._id.toString(),
        email: adminUser.email,
        humanId: adminUser.humanId,
        role: adminUser.role,
      },
      action: 'INITIAL_SETUP_COMPLETED',
      resource: 'installation',
      resourceId: state._id.toString(),
      description: `Initial installation setup completed for organization "${org.name}"`,
      metadata: {
        organizationName: org.name,
        adminEmail: adminUser.email,
        version: '1.0.0',
      },
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      message: 'Modus installation and initialization successfully completed',
      administrator: {
        id: adminUser._id.toString(),
        humanId: adminUser.humanId,
        email: adminUser.email,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        role: adminUser.role,
      },
      organization: {
        name: org.name,
        email: org.email,
        currency: org.currency,
      },
      tokens,
    };
  }
}
