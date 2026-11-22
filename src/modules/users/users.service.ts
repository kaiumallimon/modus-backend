import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as argon2 from 'argon2';
import { User, UserDocument } from './schemas/user.schema';
import { Role } from './enums/role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

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
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
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

  async createUser(dto: CreateUserDto, creatorRole: Role) {
    if (creatorRole !== Role.SUPER_ADMIN && dto.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can assign the SUPER_ADMIN role',
      );
    }

    const existingUser = await this.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await argon2.hash(dto.password);
    const newUser = await this.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      isActive: true,
      hashedRefreshToken: null,
    });

    return this.findOne(newUser._id.toString());
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
        .select('-passwordHash -hashedRefreshToken')
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
      .select('-passwordHash -hashedRefreshToken')
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
