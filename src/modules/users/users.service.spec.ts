import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { Role } from './enums/role.enum';
import { MailService } from '../mail/mail.service';

describe('UsersService', () => {
  let service: UsersService;
  let mockUserModel: any;
  let mockMailService: Partial<Record<keyof MailService, jest.Mock>>;

  const validObjectId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockUserModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ _id: validObjectId, ...dto }),
    }));

    mockUserModel.findOne = jest.fn();
    mockUserModel.findById = jest.fn();
    mockUserModel.find = jest.fn();
    mockUserModel.countDocuments = jest.fn();
    mockUserModel.findByIdAndUpdate = jest.fn();
    mockUserModel.findByIdAndDelete = jest.fn();

    mockMailService = {
      sendWelcomeCredentials: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    it('should throw ForbiddenException if non-SUPER_ADMIN tries to create SUPER_ADMIN', async () => {
      await expect(
        service.createUser(
          {
            email: 'admin@pharmbrew.com',
            firstName: 'Super',
            lastName: 'Admin',
            role: Role.SUPER_ADMIN,
          },
          Role.ADMIN,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if email is already taken', async () => {
      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'existing' }),
      });

      await expect(
        service.createUser(
          {
            email: 'existing@pharmbrew.com',
            firstName: 'Existing',
            lastName: 'User',
            role: Role.EMPLOYEE,
          },
          Role.SUPER_ADMIN,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should create user, dispatch credentials email, and return clean profile', async () => {
      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            _id: validObjectId,
            email: 'new@pharmbrew.com',
            role: Role.EMPLOYEE,
          }),
        }),
      });

      const result = await service.createUser(
        {
          email: 'new@pharmbrew.com',
          firstName: 'New',
          lastName: 'User',
          role: Role.EMPLOYEE,
        },
        Role.SUPER_ADMIN,
      );

      expect(mockMailService.sendWelcomeCredentials).toHaveBeenCalledWith(
        'new@pharmbrew.com',
        'New',
        expect.stringMatching(/^[A-Z][a-z]{3,4}[@#$!%*]\d{3}$/),
      );
      expect(result).toHaveProperty('email', 'new@pharmbrew.com');
    });
  });

  describe('validateEmailDeliverability', () => {
    it('should accept valid format and skip DNS for test domains', async () => {
      await expect(
        service.validateEmailDeliverability('pharmacist@test.com'),
      ).resolves.toBeUndefined();
    });

    it('should throw BadRequestException if email has invalid format', async () => {
      await expect(
        service.validateEmailDeliverability('invalid-email'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should throw BadRequestException if id format is invalid', async () => {
      await expect(service.findOne('invalid-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(service.findOne(validObjectId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return user when found', async () => {
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            _id: validObjectId,
            email: 'user@test.com',
          }),
        }),
      });

      const user = await service.findOne(validObjectId);
      expect(user).toHaveProperty('_id', validObjectId);
    });
  });

  describe('update', () => {
    it('should throw ForbiddenException if ADMIN attempts to change role', async () => {
      mockUserModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validObjectId,
          role: Role.EMPLOYEE,
        }),
      });

      await expect(
        service.update(
          validObjectId,
          { role: Role.MANAGER },
          'requester-id',
          Role.ADMIN,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if non-SUPER_ADMIN attempts to modify SUPER_ADMIN', async () => {
      mockUserModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validObjectId,
          role: Role.SUPER_ADMIN,
        }),
      });

      await expect(
        service.update(
          validObjectId,
          { firstName: 'NewName' },
          'requester-id',
          Role.ADMIN,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateStatus', () => {
    it('should throw BadRequestException if user tries to deactivate themselves', async () => {
      await expect(
        service.updateStatus(
          validObjectId,
          { isActive: false },
          validObjectId,
          Role.SUPER_ADMIN,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if non-SUPER_ADMIN modifies SUPER_ADMIN status', async () => {
      mockUserModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validObjectId,
          role: Role.SUPER_ADMIN,
        }),
      });

      await expect(
        service.updateStatus(
          validObjectId,
          { isActive: false },
          'other-id',
          Role.ADMIN,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
