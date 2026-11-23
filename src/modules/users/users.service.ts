import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import * as argon2 from 'argon2';
import { promises as dns } from 'dns';
import { User, UserDocument } from './schemas/user.schema';
import { Role } from './enums/role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { MailService } from '../mail/mail.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AccessControlService } from '../access-control/access-control.service';
import { generateHumanReadablePassword } from './utils/password.util';
import { generateHumanId } from './utils/human-id.util';

export interface PaginatedUsersResult {
  data: UserDocument[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface UserEffectivePermissions {
  userId: string;
  humanId?: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
  permissions: string[];
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly mailService: MailService,
    private readonly auditLogService: AuditLogService,
    private readonly accessControlService: AccessControlService,
  ) {}

  async generateUniqueHumanId(): Promise<string> {
    for (let attempts = 0; attempts < 15; attempts++) {
      const candidate = generateHumanId();
      const existing = await this.userModel.findOne({ humanId: candidate }).exec();
      if (!existing) {
        return candidate;
      }
    }
    // High-entropy fallback if dense
    return `MOD-${Date.now().toString().slice(-6)}`;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByIdentifier(identifier: string): Promise<UserDocument | null> {
    const trimmed = identifier.trim();
    const compactUpper = trimmed.replace(/\s+/g, '').toUpperCase();
    const user = await this.userModel
      .findOne({
        $or: [
          { email: trimmed.toLowerCase() },
          { humanId: trimmed.toUpperCase() },
          { humanId: compactUpper },
        ],
      })
      .exec();

    if (user && !user.humanId) {
      // Auto-assign humanId if missing on legacy documents
      user.humanId = await this.generateUniqueHumanId();
      await user.save();
    }

    return user;
  }

  async findByResetTokenHash(tokenHash: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ resetPasswordTokenHash: tokenHash }).exec();
  }

  async create(data: Partial<User>): Promise<UserDocument> {
    const user = new this.userModel(data);
    return user.save();
  }

  async countSuperAdmins(): Promise<number> {
    return this.userModel.countDocuments({ role: Role.SUPER_ADMIN }).exec();
  }

  async countActiveSuperAdmins(): Promise<number> {
    return this.userModel
      .countDocuments({ role: Role.SUPER_ADMIN, isActive: true })
      .exec();
  }

  async updateHashedRefreshToken(
    userId: string,
    hashedRefreshToken: string | null,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(userId, { hashedRefreshToken }, { new: true })
      .exec();
  }

  async deleteById(userId: string): Promise<UserDocument | null> {
    const target = await this.userModel.findById(userId).exec();
    if (target && target.role === Role.SUPER_ADMIN && target.isActive) {
      const activeAdmins = await this.countActiveSuperAdmins();
      if (activeAdmins <= 1) {
        throw new ForbiddenException(
          'Cannot delete the last active Super Administrator',
        );
      }
    }
    return this.userModel.findByIdAndDelete(userId).exec();
  }

  async validateEmailDeliverability(email: string): Promise<void> {
    const parts = email.split('@');
    if (parts.length !== 2 || !parts[1]) {
      throw new BadRequestException('Invalid email address format');
    }

    const domain = parts[1].toLowerCase().trim();

    // Skip DNS MX lookup for test runs and placeholder/local domains
    const isTest = process.env.NODE_ENV === 'test';
    const testDomains = [
      'example.com',
      'test.com',
      'modus.local',
      'localhost',
    ];
    if (isTest || testDomains.includes(domain)) {
      return;
    }

    try {
      const records = await dns.resolveMx(domain);
      if (!records || records.length === 0) {
        throw new BadRequestException(
          `Domain "${domain}" has no active mail exchange (MX) records and cannot receive emails`,
        );
      }
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (
        error.code === 'ENOTFOUND' ||
        error.code === 'ENODATA' ||
        error.code === 'ESERVFAIL'
      ) {
        throw new BadRequestException(
          `Domain "${domain}" does not exist or does not support incoming emails`,
        );
      }
      this.logger.warn(
        `DNS resolution warning for domain ${domain}: ${error?.message || error}`,
      );
    }
  }

  async createUser(dto: CreateUserDto, creatorRole: Role | string) {
    const roleCode = dto.role.toUpperCase().trim();

    if (creatorRole !== Role.SUPER_ADMIN && roleCode === Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can assign the SUPER_ADMIN role',
      );
    }

    // Verify role exists and is active in Access Control registry
    const roleDoc = await this.accessControlService.findRoleByCode(roleCode);
    if (!roleDoc) {
      throw new BadRequestException(`Role "${dto.role}" does not exist`);
    }
    if (!roleDoc.isActive) {
      throw new BadRequestException(
        `Role "${roleDoc.name}" (${roleCode}) is inactive and cannot be assigned`,
      );
    }

    await this.validateEmailDeliverability(dto.email);

    const existingUser = await this.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const humanId = await this.generateUniqueHumanId();
    const temporaryPassword = generateHumanReadablePassword();
    const passwordHash = await argon2.hash(temporaryPassword);

    // Transactional creation: ensure email dispatch and DB persistence are atomic
    let session: ClientSession | null = null;
    try {
      session = await this.connection.startSession();
      session.startTransaction();
    } catch {
      session = null;
    }

    let createdUserId: string | null = null;

    try {
      const userDoc = new this.userModel({
        humanId,
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: roleCode,
        isActive: true,
        hashedRefreshToken: null,
      });

      const savedUser = session
        ? await userDoc.save({ session })
        : await userDoc.save();

      createdUserId = savedUser._id.toString();

      // Dispatch welcome credentials email. If this throws, execution jumps to catch block!
      await this.mailService.sendWelcomeCredentials(
        savedUser.email,
        savedUser.firstName,
        temporaryPassword,
        savedUser.humanId,
      );

      // Email was successfully delivered; commit transaction
      if (session) {
        await session.commitTransaction();
      }

      await this.auditLogService.record({
        actor: {
          id: 'system',
          email: 'user-management@modus.local',
          role: String(creatorRole),
        },
        action: 'USER_CREATE',
        resource: 'users',
        resourceId: createdUserId,
        description: `Created user ${savedUser.email} with role ${savedUser.role}`,
        metadata: {
          email: savedUser.email,
          role: savedUser.role,
          humanId: savedUser.humanId,
        },
      });

      return this.findOne(createdUserId);
    } catch (error) {
      if (session) {
        await session.abortTransaction();
      } else if (createdUserId) {
        // Fallback compensation for standalone mongo or environments without replica sets
        await this.userModel.findByIdAndDelete(createdUserId).exec();
      }
      this.logger.error(
        `User creation aborted/rolled back for ${dto.email}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    } finally {
      if (session) {
        await session.endSession();
      }
    }
  }

  async findAll(query: QueryUserDto): Promise<PaginatedUsersResult> {
    const filter: Record<string, any> = {};

    if (query.role) {
      filter.role = query.role.toUpperCase().trim();
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    if (query.search && query.search.trim()) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [
        { humanId: searchRegex },
        { email: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.userModel.countDocuments(filter).exec(),
      this.userModel
        .find(filter)
        .select('-passwordHash -hashedRefreshToken -resetPasswordTokenHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel
      .findById(id)
      .select('-passwordHash -hashedRefreshToken -resetPasswordTokenHash')
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    currentUserId: string,
    currentUserRole: Role | string,
  ): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const targetUser = await this.userModel.findById(id).exec();
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (currentUserRole !== Role.SUPER_ADMIN) {
      if (targetUser.role === Role.SUPER_ADMIN) {
        throw new ForbiddenException(
          'Only SUPER_ADMIN can modify a SUPER_ADMIN account',
        );
      }
      if (dto.role !== undefined && dto.role !== targetUser.role) {
        throw new ForbiddenException(
          'Only SUPER_ADMIN can modify user roles or promote users',
        );
      }
    }

    if (dto.role !== undefined) {
      const normalizedRole = dto.role.toUpperCase().trim();
      const isSelf =
        String(id) === String(currentUserId) ||
        targetUser._id.toString() === String(currentUserId);

      if (isSelf && normalizedRole !== targetUser.role) {
        throw new BadRequestException(
          'Current logged in super user cannot change their own role',
        );
      }
    }

    if (dto.firstName !== undefined) {
      targetUser.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      targetUser.lastName = dto.lastName;
    }
    if (dto.role !== undefined && currentUserRole === Role.SUPER_ADMIN) {
      const newRoleCode = dto.role.toUpperCase().trim();
      const roleDoc = await this.accessControlService.findRoleByCode(newRoleCode);
      if (!roleDoc) {
        throw new BadRequestException(`Role "${dto.role}" does not exist`);
      }
      if (!roleDoc.isActive) {
        throw new BadRequestException(
          `Role "${roleDoc.name}" (${newRoleCode}) is inactive and cannot be assigned`,
        );
      }

      if (
        targetUser.role === Role.SUPER_ADMIN &&
        newRoleCode !== Role.SUPER_ADMIN
      ) {
        const activeAdmins = await this.countActiveSuperAdmins();
        if (activeAdmins <= 1 && targetUser.isActive) {
          throw new ForbiddenException(
            'Cannot demote the last active Super Administrator',
          );
        }
      }
      targetUser.role = newRoleCode;
    }

    await targetUser.save();

    await this.auditLogService.record({
      actor: {
        id: currentUserId,
        email: 'user-management@modus.local',
        role: String(currentUserRole),
      },
      action: 'USER_UPDATE',
      resource: 'users',
      resourceId: id,
      description: `Updated profile for user ${targetUser.email}`,
      metadata: { updatedFields: Object.keys(dto) },
    });

    return this.findOne(id);
  }

  async assignRole(
    userId: string,
    newRoleCode: string,
    currentUserId: string,
    currentUserRole: Role | string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const targetUser = await this.userModel.findById(userId).exec();
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (
      String(userId) === String(currentUserId) ||
      targetUser._id.toString() === String(currentUserId)
    ) {
      throw new BadRequestException(
        'Current logged in super user cannot change their own role',
      );
    }

    const code = newRoleCode.toUpperCase().trim();
    const roleDoc = await this.accessControlService.findRoleByCode(code);
    if (!roleDoc) {
      throw new BadRequestException(`Role "${newRoleCode}" does not exist`);
    }

    if (!roleDoc.isActive) {
      throw new BadRequestException(
        `Role "${roleDoc.name}" (${code}) is currently inactive and cannot be assigned`,
      );
    }

    if (targetUser.role === code) {
      return this.findOne(userId);
    }

    // Demotion check: protect the last active SUPER_ADMIN
    if (targetUser.role === Role.SUPER_ADMIN && code !== Role.SUPER_ADMIN) {
      const activeAdmins = await this.countActiveSuperAdmins();
      if (activeAdmins <= 1 && targetUser.isActive) {
        throw new ForbiddenException(
          'Cannot demote the last active Super Administrator',
        );
      }
    }

    const oldRole = targetUser.role;
    targetUser.role = code;
    await targetUser.save();

    await this.auditLogService.record({
      actor: {
        id: currentUserId,
        email: 'user-management@modus.local',
        role: String(currentUserRole),
      },
      action: 'USER_ROLE_ASSIGN',
      resource: 'users',
      resourceId: userId,
      description: `Changed role of user ${targetUser.email} from ${oldRole} to ${code}`,
      metadata: {
        previousRole: oldRole,
        newRole: code,
        userEmail: targetUser.email,
        userHumanId: targetUser.humanId,
      },
      ipAddress,
      userAgent,
    });

    return this.findOne(userId);
  }

  async getUserPermissions(userId: string): Promise<UserEffectivePermissions> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isSuperAdmin = user.role === Role.SUPER_ADMIN;
    let permissions: string[] = [];

    if (isSuperAdmin) {
      // Super Administrator possesses all registered permissions
      permissions = this.accessControlService
        .getAllPermissions()
        .map((p) => p.id);
    } else {
      const roleDoc = await this.accessControlService.findRoleByCode(user.role);
      if (roleDoc && roleDoc.isActive) {
        permissions = roleDoc.permissions;
      }
    }

    return {
      userId: user._id.toString(),
      humanId: user.humanId,
      email: user.email,
      role: user.role,
      isSuperAdmin,
      permissions,
    };
  }

  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
    currentUserId: string,
    currentUserRole: Role | string,
  ): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID format');
    }

    if (id === currentUserId) {
      throw new BadRequestException(
        'Users cannot deactivate or modify their own active status',
      );
    }

    const targetUser = await this.userModel.findById(id).exec();
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (
      currentUserRole !== Role.SUPER_ADMIN &&
      targetUser.role === Role.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can modify a SUPER_ADMIN active status',
      );
    }

    if (targetUser.role === Role.SUPER_ADMIN && dto.isActive === false) {
      const activeAdmins = await this.countActiveSuperAdmins();
      if (activeAdmins <= 1) {
        throw new ForbiddenException(
          'Cannot deactivate the last active Super Administrator',
        );
      }
    }

    targetUser.isActive = dto.isActive;
    if (!dto.isActive) {
      targetUser.hashedRefreshToken = null;
    }

    await targetUser.save();

    await this.auditLogService.record({
      actor: {
        id: currentUserId,
        email: 'user-management@modus.local',
        role: String(currentUserRole),
      },
      action: 'USER_STATUS_CHANGE',
      resource: 'users',
      resourceId: id,
      description: `User ${targetUser.email} status set to ${dto.isActive ? 'active' : 'inactive'}`,
      metadata: { isActive: dto.isActive },
    });

    return this.findOne(id);
  }
}
