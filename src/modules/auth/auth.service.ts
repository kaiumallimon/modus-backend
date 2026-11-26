import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { Role } from '../users/enums/role.enum';
import { SeedSuperAdminDto } from './dto/seed-super-admin.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { MailService } from '../mail/mail.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { StorageService } from '../storage/storage.service';
import 'multer';

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
    private readonly mailService: MailService,
    private readonly auditLogService: AuditLogService,
    private readonly storageService: StorageService,
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

  private parseDurationMs(ttl: string | undefined, fallbackMs: number): number {
    if (!ttl) return fallbackMs;
    const match = String(ttl).trim().match(/^(\d+)\s*([smhd])?$/i);
    if (!match) return fallbackMs;
    const amount = Number(match[1]);
    const unit = (match[2] || 's').toLowerCase();
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return amount * (multipliers[unit] || 1000);
  }

  private getRefreshExpiryDate(): Date {
    const refreshExpiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') ||
      this.configService.get<string>('jwt.refreshExpireIn') ||
      '7d';
    return new Date(
      Date.now() +
        this.parseDurationMs(refreshExpiresIn, 7 * 24 * 60 * 60 * 1000),
    );
  }

  private async persistNewSession(
    userId: string,
    sid: string,
    hashedRefreshToken: string,
  ): Promise<void> {
    if (typeof this.usersService.addRefreshSession === 'function') {
      const now = new Date();
      await this.usersService.addRefreshSession(userId, {
        sid,
        tokenHash: hashedRefreshToken,
        previousTokenHash: null,
        rotatedAt: null,
        expiresAt: this.getRefreshExpiryDate(),
        createdAt: now,
        lastUsedAt: now,
      });
    } else {
      await this.usersService.updateHashedRefreshToken(
        userId,
        hashedRefreshToken,
      );
    }
  }

  async generateTokens(
    userId: string,
    email: string,
    role: Role | string,
    sid: string = crypto.randomUUID(),
  ): Promise<AuthTokens> {
    const jwtPayload = {
      sub: userId,
      email,
      role,
      sid,
    };

    const accessSecret =
      this.configService.getOrThrow<string>('jwt.accessSecret');
    const refreshSecret =
      this.configService.getOrThrow<string>('jwt.refreshSecret');
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

    const humanId = await this.usersService.generateUniqueHumanId();
    const passwordHash = await this.hashData(dto.password);
    const newUser = await this.usersService.create({
      humanId,
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: Role.SUPER_ADMIN,
      isActive: true,
      hashedRefreshToken: null,
    });

    const sid = crypto.randomUUID();
    const tokens = await this.generateTokens(
      newUser._id.toString(),
      newUser.email,
      newUser.role,
      sid,
    );

    const hashedRefreshToken = await this.hashData(tokens.refreshToken);
    await this.persistNewSession(
      newUser._id.toString(),
      sid,
      hashedRefreshToken,
    );

    return {
      message: 'Initial Super Admin created successfully',
      user: {
        id: newUser._id.toString(),
        humanId: newUser.humanId,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
      },
      tokens,
    };
  }

  async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const rawIdentifier = (dto.identifier || '').trim();
    const rawEmail = (dto.email || '').trim();
    const lookupKey = rawIdentifier || rawEmail;

    if (!lookupKey) {
      throw new UnauthorizedException('Email or User ID is required');
    }

    let user = await this.usersService.findByIdentifier(lookupKey);
    // If not found by primary lookupKey but secondary was provided, attempt fallback
    if (!user && rawEmail && rawEmail !== lookupKey) {
      user = await this.usersService.findByIdentifier(rawEmail);
    }
    if (!user && rawIdentifier && rawIdentifier !== lookupKey) {
      user = await this.usersService.findByIdentifier(rawIdentifier);
    }

    if (!user || !user.isActive) {
      await this.auditLogService.record({
        actor: {
          id: user ? user._id.toString() : 'unknown',
          email: lookupKey,
        },
        action: 'AUTH_LOGIN_FAILED',
        resource: 'auth',
        description: `Failed login attempt for identifier: ${lookupKey}`,
        metadata: { identifier: lookupKey, reason: !user ? 'not_found' : 'inactive' },
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedException('Invalid email/ID or password');
    }

    const isPasswordValid = await this.verifyHash(
      user.passwordHash,
      dto.password,
    );
    if (!isPasswordValid) {
      await this.auditLogService.record({
        actor: {
          id: user._id.toString(),
          email: user.email,
          humanId: user.humanId,
          role: user.role,
        },
        action: 'AUTH_LOGIN_FAILED',
        resource: 'auth',
        resourceId: user._id.toString(),
        description: `Failed password login attempt for ${user.email}`,
        metadata: { identifier: lookupKey, reason: 'invalid_password' },
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedException('Invalid email/ID or password');
    }

    const sid = crypto.randomUUID();
    const tokens = await this.generateTokens(
      user._id.toString(),
      user.email,
      user.role,
      sid,
    );

    const hashedRefreshToken = await this.hashData(tokens.refreshToken);
    await this.persistNewSession(
      user._id.toString(),
      sid,
      hashedRefreshToken,
    );

    await this.auditLogService.record({
      actor: {
        id: user._id.toString(),
        email: user.email,
        humanId: user.humanId,
        role: user.role,
      },
      action: 'AUTH_LOGIN_SUCCESS',
      resource: 'auth',
      resourceId: user._id.toString(),
      description: `User ${user.email} logged in successfully`,
      metadata: { humanId: user.humanId, role: user.role },
      ipAddress,
      userAgent,
    });

    return {
      user: {
        id: user._id.toString(),
        humanId: user.humanId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl || null,
      },
      tokens,
    };
  }

  async refreshTokens(refreshToken: string) {
    let payload: { sub: string; email: string; role: Role; sid?: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Access denied');
    }

    const userId = user._id.toString();
    const sessions = Array.isArray(user.refreshSessions)
      ? user.refreshSessions
      : [];
    const matchedSession = payload.sid
      ? sessions.find((s) => s.sid === payload.sid)
      : undefined;

    if (matchedSession) {
      if (
        matchedSession.expiresAt &&
        new Date() > new Date(matchedSession.expiresAt)
      ) {
        if (typeof this.usersService.revokeRefreshSession === 'function') {
          await this.usersService.revokeRefreshSession(userId, matchedSession.sid);
        }
        throw new UnauthorizedException('Refresh session has expired');
      }

      const isCurrentValid = await this.verifyHash(
        matchedSession.tokenHash,
        refreshToken,
      );

      if (isCurrentValid) {
        const tokens = await this.generateTokens(
          userId,
          user.email,
          user.role,
          matchedSession.sid,
        );
        const newHashedRefreshToken = await this.hashData(tokens.refreshToken);
        const now = new Date();

        if (typeof this.usersService.updateRefreshSession === 'function') {
          await this.usersService.updateRefreshSession(
            userId,
            matchedSession.sid,
            {
              tokenHash: newHashedRefreshToken,
              previousTokenHash: matchedSession.tokenHash,
              rotatedAt: now,
              lastUsedAt: now,
              expiresAt: this.getRefreshExpiryDate(),
            },
          );
        } else {
          await this.usersService.updateHashedRefreshToken(
            userId,
            newHashedRefreshToken,
          );
        }

        return tokens;
      }

      // Allow short 15s rotation grace window for parallel/dropped-response retries
      const rotatedAtMs = matchedSession.rotatedAt
        ? new Date(matchedSession.rotatedAt).getTime()
        : 0;
      const withinGraceWindow =
        Boolean(matchedSession.previousTokenHash) &&
        rotatedAtMs > 0 &&
        Date.now() - rotatedAtMs <= 15_000;

      if (
        withinGraceWindow &&
        (await this.verifyHash(matchedSession.previousTokenHash!, refreshToken))
      ) {
        const tokens = await this.generateTokens(
          userId,
          user.email,
          user.role,
          matchedSession.sid,
        );
        const newHashedRefreshToken = await this.hashData(tokens.refreshToken);
        const now = new Date();

        if (typeof this.usersService.updateRefreshSession === 'function') {
          await this.usersService.updateRefreshSession(
            userId,
            matchedSession.sid,
            {
              tokenHash: newHashedRefreshToken,
              lastUsedAt: now,
              expiresAt: this.getRefreshExpiryDate(),
            },
          );
        }
        return tokens;
      }

      // Outside grace window: possible token reuse — revoke only this compromised session
      if (typeof this.usersService.revokeRefreshSession === 'function') {
        await this.usersService.revokeRefreshSession(userId, matchedSession.sid);
      } else {
        await this.usersService.updateHashedRefreshToken(userId, null);
      }
      throw new UnauthorizedException(
        'Access denied: refresh token reuse detected or invalid token',
      );
    }

    // Legacy fallback for tokens minted before per-session tracking
    if (!user.hashedRefreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    const isLegacyRefreshValid = await this.verifyHash(
      user.hashedRefreshToken,
      refreshToken,
    );

    if (!isLegacyRefreshValid) {
      await this.usersService.updateHashedRefreshToken(userId, null);
      throw new UnauthorizedException(
        'Access denied: refresh token reuse detected or invalid token',
      );
    }

    const upgradedSid = payload.sid || crypto.randomUUID();
    const tokens = await this.generateTokens(
      userId,
      user.email,
      user.role,
      upgradedSid,
    );

    const newHashedRefreshToken = await this.hashData(tokens.refreshToken);
    await this.persistNewSession(userId, upgradedSid, newHashedRefreshToken);

    return tokens;
  }

  async logout(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    sid?: string,
  ) {
    const user = await this.usersService.findById(userId);
    if (sid && typeof this.usersService.revokeRefreshSession === 'function') {
      await this.usersService.revokeRefreshSession(userId, sid);
    } else if (typeof this.usersService.revokeAllRefreshSessions === 'function') {
      await this.usersService.revokeAllRefreshSessions(userId);
    } else {
      await this.usersService.updateHashedRefreshToken(userId, null);
    }

    if (user) {
      await this.auditLogService.record({
        actor: {
          id: user._id.toString(),
          email: user.email,
          humanId: user.humanId,
          role: user.role,
        },
        action: 'AUTH_LOGOUT',
        resource: 'auth',
        resourceId: user._id.toString(),
        description: `User ${user.email} logged out`,
        ipAddress,
        userAgent,
      });
    }

    return {
      success: true,
      message: 'Successfully logged out',
    };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account not found or inactive');
    }

    const isCurrentValid = await this.verifyHash(
      user.passwordHash,
      dto.currentPassword,
    );
    if (!isCurrentValid) {
      throw new UnauthorizedException('Invalid current password');
    }

    user.passwordHash = await this.hashData(dto.newPassword);
    // Invalidate existing sessions on password change
    user.hashedRefreshToken = null;
    user.refreshSessions = [];
    await user.save();

    await this.auditLogService.record({
      actor: {
        id: user._id.toString(),
        email: user.email,
        humanId: user.humanId,
        role: user.role,
      },
      action: 'AUTH_PASSWORD_CHANGE',
      resource: 'auth',
      resourceId: user._id.toString(),
      description: `User ${user.email} successfully changed their password`,
      ipAddress,
      userAgent,
    });

    return {
      message: 'Password changed successfully. Please log in with your new password.',
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const genericResponse = {
      message:
        'If an active account with that email or User ID exists, a password reset token has been sent to the registered email address.',
    };

    const user = await this.usersService.findByIdentifier(dto.identifier);
    if (!user || !user.isActive) {
      return genericResponse;
    }

    // Generate cryptographically secure random token (64 hex characters)
    const rawToken = crypto.randomBytes(32).toString('hex');
    // Store only the SHA-256 hash of the token
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiration
    await user.save();

    // Send email with the unhashed token (never log or reveal token in console)
    await this.mailService.sendPasswordResetEmail(
      user.email,
      user.firstName,
      rawToken,
    );

    return genericResponse;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(dto.token.trim())
      .digest('hex');

    const user = await this.usersService.findByResetTokenHash(tokenHash);
    if (!user || !user.resetPasswordExpiresAt) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    if (new Date() > user.resetPasswordExpiresAt) {
      // Invalidate expired token
      user.resetPasswordTokenHash = null;
      user.resetPasswordExpiresAt = null;
      await user.save();
      throw new BadRequestException(
        'Password reset token has expired. Please request a new one.',
      );
    }

    // Single-use: immediately clear the reset token
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;

    // Hash new password with Argon2
    user.passwordHash = await this.hashData(dto.newPassword);

    // Revoke all active login refresh tokens
    user.hashedRefreshToken = null;
    user.refreshSessions = [];
    await user.save();

    await this.auditLogService.record({
      actor: {
        id: user._id ? user._id.toString() : 'unknown',
        email: user.email,
        humanId: user.humanId,
        role: user.role,
      },
      action: 'AUTH_PASSWORD_RESET',
      resource: 'auth',
      resourceId: user._id ? user._id.toString() : undefined,
      description: `User ${user.email} reset password using single-use token`,
    });

    return {
      message:
        'Password has been reset successfully. You may now log in with your new password.',
    };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user._id.toString(),
      humanId: user.humanId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      avatarUrl: user.avatarUrl || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.avatarUrl) {
      await this.storageService.deleteAvatar(user.avatarUrl);
    }

    const { url } = await this.storageService.uploadAvatar(userId, file);
    user.avatarUrl = url;
    await user.save();

    await this.auditLogService.record({
      actor: {
        id: user._id.toString(),
        email: user.email,
        humanId: user.humanId,
        role: user.role,
      },
      action: 'USER_AVATAR_UPDATE',
      resource: 'users',
      resourceId: user._id.toString(),
      description: `User ${user.email} updated profile avatar`,
      ipAddress,
      userAgent,
    });

    return {
      avatarUrl: url,
      user: {
        id: user._id.toString(),
        humanId: user.humanId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async removeAvatar(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.avatarUrl) {
      await this.storageService.deleteAvatar(user.avatarUrl);
      user.avatarUrl = null;
      await user.save();

      await this.auditLogService.record({
        actor: {
          id: user._id.toString(),
          email: user.email,
          humanId: user.humanId,
          role: user.role,
        },
        action: 'USER_AVATAR_DELETE',
        resource: 'users',
        resourceId: user._id.toString(),
        description: `User ${user.email} removed profile avatar`,
        ipAddress,
        userAgent,
      });
    }

    return {
      avatarUrl: null,
      user: {
        id: user._id.toString(),
        humanId: user.humanId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        avatarUrl: null,
      },
    };
  }
}
