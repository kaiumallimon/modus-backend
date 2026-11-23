import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: Partial<Record<keyof AuthService, jest.Mock>>;

  beforeEach(async () => {
    mockAuthService = {
      seedSuperAdmin: jest.fn(),
      login: jest.fn(),
      refreshTokens: jest.fn(),
      logout: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      getProfile: jest.fn(),
      uploadAvatar: jest.fn(),
      removeAvatar: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate seedSuperAdmin to service', async () => {
    const dto = {
      email: 'admin@modus.local',
      password: 'Password123!',
      firstName: 'Super',
      lastName: 'Admin',
    };
    mockAuthService.seedSuperAdmin!.mockResolvedValue({ message: 'Success' });

    const result = await controller.seedSuperAdmin(dto);
    expect(mockAuthService.seedSuperAdmin).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ message: 'Success' });
  });

  it('should delegate forgotPassword to service', async () => {
    const dto = { identifier: 'MOD-10492' };
    mockAuthService.forgotPassword!.mockResolvedValue({ message: 'Email sent' });

    const result = await controller.forgotPassword(dto);
    expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ message: 'Email sent' });
  });

  it('should delegate resetPassword to service', async () => {
    const dto = { token: 'token123', newPassword: 'NewPassword123!' };
    mockAuthService.resetPassword!.mockResolvedValue({ message: 'Password reset' });

    const result = await controller.resetPassword(dto);
    expect(mockAuthService.resetPassword).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ message: 'Password reset' });
  });

  it('should delegate logout to service', async () => {
    mockAuthService.logout!.mockResolvedValue({ message: 'Logged out' });

    const result = await controller.logout('user123');
    expect(mockAuthService.logout).toHaveBeenCalledWith('user123', undefined, undefined);
    expect(result).toEqual({ message: 'Logged out' });
  });

  it('should delegate uploadAvatar to service for current authenticated user', async () => {
    const mockFile = { buffer: Buffer.from('test') } as any;
    mockAuthService.uploadAvatar!.mockResolvedValue({
      avatarUrl: 'https://cdn.archetechnologies.tech/avatars/user-123.jpg',
    });

    const result = await controller.uploadAvatar('user123', mockFile);
    expect(mockAuthService.uploadAvatar).toHaveBeenCalledWith('user123', mockFile, undefined, undefined);
    expect(result).toEqual({
      avatarUrl: 'https://cdn.archetechnologies.tech/avatars/user-123.jpg',
    });
  });

  it('should delegate removeAvatar to service for current authenticated user', async () => {
    mockAuthService.removeAvatar!.mockResolvedValue({ avatarUrl: null });

    const result = await controller.removeAvatar('user123');
    expect(mockAuthService.removeAvatar).toHaveBeenCalledWith('user123', undefined, undefined);
    expect(result).toEqual({ avatarUrl: null });
  });
});
