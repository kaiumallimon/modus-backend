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

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly mailService: MailService,
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
    return `PB-${Date.now().toString().slice(-6)}`;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByIdentifier(identifier: string): Promise<UserDocument | null> {
    const trimmed = identifier.trim();
    const user = await this.userModel
      .findOne({
        $or: [
          { email: trimmed.toLowerCase() },
          { humanId: trimmed.toUpperCase() },
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

  async updateHashedRefreshToken(
    userId: string,
    hashedRefreshToken: string | null,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(userId, { hashedRefreshToken }, { new: true })
      .exec();
  }

  async deleteById(userId: string): Promise<UserDocument | null> {
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
      'pharmbrew.com',
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

  async createUser(dto: CreateUserDto, creatorRole: Role) {
    if (creatorRole !== Role.SUPER_ADMIN && dto.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can assign the SUPER_ADMIN role',
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
        role: dto.role,
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
      filter.role = query.role;
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
    _currentUserId: string,
    currentUserRole: Role,
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

    if (dto.firstName !== undefined) {
      targetUser.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      targetUser.lastName = dto.lastName;
    }
    if (dto.role !== undefined && currentUserRole === Role.SUPER_ADMIN) {
      targetUser.role = dto.role;
    }

    await targetUser.save();
    return this.findOne(id);
  }

  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
    currentUserId: string,
    currentUserRole: Role,
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

    targetUser.isActive = dto.isActive;
    if (!dto.isActive) {
      targetUser.hashedRefreshToken = null;
    }

    await targetUser.save();
    return this.findOne(id);
  }
}
