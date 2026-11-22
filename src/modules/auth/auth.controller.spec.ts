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
      getProfile: jest.fn(),
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
      email: 'admin@pharmbrew.com',
      password: 'Password123!',
      firstName: 'Super',
      lastName: 'Admin',
    };
    mockAuthService.seedSuperAdmin!.mockResolvedValue({ message: 'Success' });

    const result = await controller.seedSuperAdmin(dto);
    expect(mockAuthService.seedSuperAdmin).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ message: 'Success' });
  });

  it('should delegate logout to service', async () => {
    mockAuthService.logout!.mockResolvedValue({ message: 'Logged out' });

    const result = await controller.logout('user123');
    expect(mockAuthService.logout).toHaveBeenCalledWith('user123');
    expect(result).toEqual({ message: 'Logged out' });
  });
});
