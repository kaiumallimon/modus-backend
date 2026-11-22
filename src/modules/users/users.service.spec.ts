import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { Role } from './enums/role.enum';

describe('UsersService', () => {
  let service: UsersService;
  let mockUserModel: any;

  beforeEach(async () => {
    mockUserModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ _id: 'user123', ...dto }),
    }));

    mockUserModel.findOne = jest.fn();
    mockUserModel.findById = jest.fn();
    mockUserModel.countDocuments = jest.fn();
    mockUserModel.findByIdAndUpdate = jest.fn();
    mockUserModel.findByIdAndDelete = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findByEmail should query with lowercase trimmed email', async () => {
    mockUserModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ email: 'test@pharmbrew.com' }),
    });

    const result = await service.findByEmail('  TEST@pharmbrew.com  ');
    expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'test@pharmbrew.com' });
    expect(result?.email).toBe('test@pharmbrew.com');
  });

  it('countSuperAdmins should query with SUPER_ADMIN role', async () => {
    mockUserModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(1),
    });

    const count = await service.countSuperAdmins();
    expect(mockUserModel.countDocuments).toHaveBeenCalledWith({ role: Role.SUPER_ADMIN });
    expect(count).toBe(1);
  });

  it('updateHashedRefreshToken should update and return user', async () => {
    mockUserModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'user123', hashedRefreshToken: 'hash' }),
    });

    const result = await service.updateHashedRefreshToken('user123', 'hash');
    expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'user123',
      { hashedRefreshToken: 'hash' },
      { new: true },
    );
    expect(result?.hashedRefreshToken).toBe('hash');
  });
});
