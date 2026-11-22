import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { Role } from '../users/enums/role.enum';
import { SeedSuperAdminDto } from './dto/seed-super-admin.dto';
import { LoginDto } from './dto/login.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async hashData(data: string): Promise<string> {
    return argon2.hash(data);
  }

  async verifyHash(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  async generateTokens(
    userId: string,
    email: string,
    role: Role,
  ): Promise<AuthTokens> {
    const jwtPayload = {
      sub: userId,
      email,
      role,
    };

    const accessSecret = this.configService.getOrThrow<string>('jwt.accessSecret');
    const refreshSecret = this.configService.getOrThrow<string>('jwt.refreshSecret');
    const accessExpiresIn =
      this.configService.get<string>('jwt.accessExpiresIn') ||
      this.configService.get<string>('jwt.accessExpireIn') ||
      '15m';
    const refreshExpiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') ||
      this.configService.get<string>('jwt.refreshExpireIn') ||
      '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn as any,
      }),
      this.jwtService.signAsync(jwtPayload, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn as any,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  async seedSuperAdmin(dto: SeedSuperAdminDto) {
    const superAdminCount = await this.usersService.countSuperAdmins();
    if (superAdminCount > 0) {
      throw new ForbiddenException(
        'Super Admin already exists. Seed endpoint is disabled.',
      );
    }

    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.hashData(dto.password);
    const newUser = await this.usersService.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: Role.SUPER_ADMIN,
      isActive: true,
      hashedRefreshToken: null,
    });

    const tokens = await this.generateTokens(
      newUser._id.toString(),
      newUser.email,
      newUser.role,
    );

    const hashedRefreshToken = await this.hashData(tokens.refreshToken);
    await this.usersService.updateHashedRefreshToken(
      newUser._id.toString(),
      hashedRefreshToken,
    );

    return {
      message: 'Initial Super Admin created successfully',
      user: {
        id: newUser._id.toString(),
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
      },
      tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await this.verifyHash(
      user.passwordHash,
      dto.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(
      user._id.toString(),
      user.email,
      user.role,
    );

    const hashedRefreshToken = await this.hashData(tokens.refreshToken);
    await this.usersService.updateHashedRefreshToken(
      user._id.toString(),
      hashedRefreshToken,
    );

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      tokens,
    };
  }

  async refreshTokens(refreshToken: string) {
    let payload: { sub: string; email: string; role: Role };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    const isRefreshTokenValid = await this.verifyHash(
      user.hashedRefreshToken,
      refreshToken,
    );

    if (!isRefreshTokenValid) {
      // Refresh token reuse / tampering detected: invalidate stored token immediately
      await this.usersService.updateHashedRefreshToken(user._id.toString(), null);
      throw new UnauthorizedException(
        'Access denied: refresh token reuse detected or invalid token',
      );
    }

    const tokens = await this.generateTokens(
      user._id.toString(),
      user.email,
      user.role,
    );

    const newHashedRefreshToken = await this.hashData(tokens.refreshToken);
    await this.usersService.updateHashedRefreshToken(
      user._id.toString(),
      newHashedRefreshToken,
    );

    return tokens;
  }

  async logout(userId: string) {
    await this.usersService.updateHashedRefreshToken(userId, null);
    return {
      success: true,
      message: 'Successfully logged out',
    };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
