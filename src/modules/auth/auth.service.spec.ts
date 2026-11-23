import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { Role } from '../users/enums/role.enum';
import { MailService } from '../mail/mail.service';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUsersService: Partial<Record<keyof UsersService, jest.Mock>>;
  let mockJwtService: Partial<Record<keyof JwtService, jest.Mock>>;
  let mockConfigService: Partial<Record<keyof ConfigService, jest.Mock>>;
  let mockMailService: Partial<Record<keyof MailService, jest.Mock>>;

  beforeEach(async () => {
    mockUsersService = {
      countSuperAdmins: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByIdentifier: jest.fn(),
      findByResetTokenHash: jest.fn(),
      create: jest.fn(),
      updateHashedRefreshToken: jest.fn(),
      generateUniqueHumanId: jest.fn().mockResolvedValue('MOD-10001'),
    };

    mockJwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };

    mockMailService = {
      sendWelcomeCredentials: jest.fn().mockResolvedValue(true),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'jwt.accessExpiresIn') return '15m';
        if (key === 'jwt.refreshExpiresIn') return '7d';
        return defaultValue;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'jwt.accessSecret') return 'access-secret-test-32-chars-long';
        if (key === 'jwt.refreshSecret') return 'refresh-secret-test-32-chars-long';
        return 'test-secret';
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MailService, useValue: mockMailService },
        {
          provide: AuditLogService,
          useValue: {
            record: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  describe('seedSuperAdmin', () => {
    it('should throw ForbiddenException if Super Admin exists', async () => {
      mockUsersService.countSuperAdmins!.mockResolvedValue(1);

      await expect(
        authService.seedSuperAdmin({
          email: 'admin@modus.local',
          password: 'Password123!',
          firstName: 'Admin',
          lastName: 'User',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if email is already taken', async () => {
      mockUsersService.countSuperAdmins!.mockResolvedValue(0);
      mockUsersService.findByEmail!.mockResolvedValue({ _id: '1' });

      await expect(
        authService.seedSuperAdmin({
          email: 'admin@modus.local',
          password: 'Password123!',
          firstName: 'Admin',
          lastName: 'User',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should seed super admin successfully when none exists', async () => {
      mockUsersService.countSuperAdmins!.mockResolvedValue(0);
      mockUsersService.findByEmail!.mockResolvedValue(null);
      mockUsersService.create!.mockResolvedValue({
        _id: 'user123',
        humanId: 'MOD-10001',
        email: 'admin@modus.local',
        firstName: 'Super',
        lastName: 'Admin',
        role: Role.SUPER_ADMIN,
      });
      mockJwtService.signAsync!.mockResolvedValue('token123');
      mockUsersService.updateHashedRefreshToken!.mockResolvedValue({});

      const result = await authService.seedSuperAdmin({
        email: 'admin@modus.local',
        password: 'Password123!',
        firstName: 'Super',
        lastName: 'Admin',
      });

      expect(result.user.email).toBe('admin@modus.local');
      expect(result.user.humanId).toBe('MOD-10001');
      expect(result.user.role).toBe(Role.SUPER_ADMIN);
      expect(result.tokens.accessToken).toBe('token123');
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException on unknown identifier', async () => {
      mockUsersService.findByIdentifier!.mockResolvedValue(null);

      await expect(
        authService.login({ identifier: 'unknown@test.com', password: 'bad' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should allow login with humanId', async () => {
      const mockUser = {
        _id: 'user123',
        humanId: 'MOD-10492',
        email: 'user@modus.local',
        firstName: 'John',
        lastName: 'Doe',
        role: Role.EMPLOYEE,
        isActive: true,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
      };
      mockUsersService.findByIdentifier!.mockResolvedValue(mockUser);
      jest.spyOn(authService, 'verifyHash').mockResolvedValue(true);
      jest.spyOn(authService, 'generateTokens').mockResolvedValue({
        accessToken: 'access123',
        refreshToken: 'refresh123',
      });
      mockUsersService.updateHashedRefreshToken!.mockResolvedValue(mockUser);

      const result = await authService.login({
        identifier: 'MOD-10492',
        password: 'ValidPassword123!',
      });

      expect(mockUsersService.findByIdentifier).toHaveBeenCalledWith('MOD-10492');
      expect(result.user.humanId).toBe('MOD-10492');
      expect(result.tokens.accessToken).toBe('access123');
    });
  });

  describe('forgotPassword', () => {
    it('should return generic success message even if identifier does not exist', async () => {
      mockUsersService.findByIdentifier!.mockResolvedValue(null);

      const result = await authService.forgotPassword({
        identifier: 'nonexistent@modus.local',
      });

      expect(result.message).toContain('If an active account with that email or User ID exists');
      expect(mockMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should generate token, save token hash, and send email if user exists', async () => {
      const mockUser = {
        email: 'john@modus.local',
        firstName: 'John',
        isActive: true,
        save: jest.fn().mockResolvedValue(true),
      };
      mockUsersService.findByIdentifier!.mockResolvedValue(mockUser);

      const result = await authService.forgotPassword({
        identifier: 'MOD-10492',
      });

      expect(mockUser.save).toHaveBeenCalled();
      expect(mockMailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'john@modus.local',
        'John',
        expect.any(String),
      );
      expect(result.message).toContain('password reset token has been sent');
    });
  });

  describe('resetPassword', () => {
    it('should throw BadRequestException if token is invalid or not found', async () => {
      mockUsersService.findByResetTokenHash!.mockResolvedValue(null);

      await expect(
        authService.resetPassword({
          token: 'invalid-token',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if token has expired', async () => {
      const mockUser = {
        resetPasswordTokenHash: 'hash',
        resetPasswordExpiresAt: new Date(Date.now() - 10000), // expired in past
        save: jest.fn().mockResolvedValue(true),
      };
      mockUsersService.findByResetTokenHash!.mockResolvedValue(mockUser);

      await expect(
        authService.resetPassword({
          token: 'expired-token',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow('Password reset token has expired');
    });

    it('should reset password, clear token, and revoke refresh token on valid request', async () => {
      const mockUser = {
        resetPasswordTokenHash: 'hash',
        resetPasswordExpiresAt: new Date(Date.now() + 60000), // valid
        passwordHash: 'oldHash',
        hashedRefreshToken: 'oldRefresh',
        save: jest.fn().mockResolvedValue(true),
      };
      mockUsersService.findByResetTokenHash!.mockResolvedValue(mockUser);

      const result = await authService.resetPassword({
        token: 'valid-token',
        newPassword: 'BrandNewPassword123!',
      });

      expect(mockUser.resetPasswordTokenHash).toBeNull();
      expect(mockUser.resetPasswordExpiresAt).toBeNull();
      expect(mockUser.hashedRefreshToken).toBeNull();
      expect(mockUser.save).toHaveBeenCalled();
      expect(result.message).toContain('Password has been reset successfully');
    });
  });
});
