import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { Role } from '../users/enums/role.enum';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUsersService: Partial<Record<keyof UsersService, jest.Mock>>;
  let mockJwtService: Partial<Record<keyof JwtService, jest.Mock>>;
  let mockConfigService: Partial<Record<keyof ConfigService, jest.Mock>>;

  beforeEach(async () => {
    mockUsersService = {
      countSuperAdmins: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateHashedRefreshToken: jest.fn(),
    };

    mockJwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
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
          email: 'admin@pharmbrew.com',
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
          email: 'admin@pharmbrew.com',
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
        email: 'superadmin@pharmbrew.com',
        firstName: 'Super',
        lastName: 'Admin',
        role: Role.SUPER_ADMIN,
      });
      mockJwtService.signAsync!.mockResolvedValue('token123');
      mockUsersService.updateHashedRefreshToken!.mockResolvedValue({});

      const result = await authService.seedSuperAdmin({
        email: 'superadmin@pharmbrew.com',
        password: 'Password123!',
        firstName: 'Super',
        lastName: 'Admin',
      });

      expect(result.user.email).toBe('superadmin@pharmbrew.com');
      expect(result.user.role).toBe(Role.SUPER_ADMIN);
      expect(result.tokens.accessToken).toBe('token123');
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException on invalid credentials', async () => {
      mockUsersService.findByEmail!.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'unknown@test.com', password: 'bad' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
