import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Role } from './enums/role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

describe('UsersController', () => {
  let controller: UsersController;
  let mockUsersService: Partial<Record<keyof UsersService, jest.Mock>>;

  const mockCurrentUser = {
    userId: '6b035bd0e2384111c7593a13',
    email: 'admin@modus.local',
    role: Role.SUPER_ADMIN,
  };

  beforeEach(async () => {
    mockUsersService = {
      createUser: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should delegate to usersService.createUser with currentUser role', async () => {
      const dto: CreateUserDto = {
        email: 'staff@modus.local',
        firstName: 'Staff',
        lastName: 'Member',
        role: Role.EMPLOYEE,
      };
      mockUsersService.createUser!.mockResolvedValue({
        id: 'user1',
        email: dto.email,
        role: dto.role,
      });

      const result = await controller.create(dto, mockCurrentUser);
      expect(mockUsersService.createUser).toHaveBeenCalledWith(
        dto,
        Role.SUPER_ADMIN,
      );
      expect(result).toHaveProperty('id', 'user1');
    });
  });

  describe('findAll', () => {
    it('should delegate to usersService.findAll with query dto', async () => {
      const query: QueryUserDto = { page: 1, limit: 10, role: Role.ADMIN };
      mockUsersService.findAll!.mockResolvedValue({
        data: [],
        meta: { total: 0 },
      });

      const result = await controller.findAll(query);
      expect(mockUsersService.findAll).toHaveBeenCalledWith(query);
      expect(result).toHaveProperty('data');
    });
  });

  describe('findOne', () => {
    it('should delegate to usersService.findOne with id', async () => {
      mockUsersService.findOne!.mockResolvedValue({ id: 'user123' });

      const result = await controller.findOne('user123');
      expect(mockUsersService.findOne).toHaveBeenCalledWith('user123');
      expect(result).toHaveProperty('id', 'user123');
    });
  });

  describe('update', () => {
    it('should delegate to usersService.update', async () => {
      const dto: UpdateUserDto = { firstName: 'Updated' };
      mockUsersService.update!.mockResolvedValue({
        id: 'user123',
        firstName: 'Updated',
      });

      const result = await controller.update('user123', dto, mockCurrentUser);
      expect(mockUsersService.update).toHaveBeenCalledWith(
        'user123',
        dto,
        mockCurrentUser.userId,
        Role.SUPER_ADMIN,
      );
      expect(result).toHaveProperty('firstName', 'Updated');
    });
  });

  describe('updateStatus', () => {
    it('should delegate to usersService.updateStatus', async () => {
      const dto: UpdateUserStatusDto = { isActive: false };
      mockUsersService.updateStatus!.mockResolvedValue({
        id: 'user123',
        isActive: false,
      });

      const result = await controller.updateStatus(
        'user123',
        dto,
        mockCurrentUser,
      );
      expect(mockUsersService.updateStatus).toHaveBeenCalledWith(
        'user123',
        dto,
        mockCurrentUser.userId,
        Role.SUPER_ADMIN,
      );
      expect(result).toHaveProperty('isActive', false);
    });
  });
});
