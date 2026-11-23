import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
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
import { AuditLogService } from '../audit-log/audit-log.service';

describe('UsersService', () => {
  let service: UsersService;
  let mockUserModel: any;
  let mockConnection: any;
  let mockSession: any;
  let mockMailService: Partial<Record<keyof MailService, jest.Mock>>;

  const validObjectId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockUserModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      _id: validObjectId,
      save: jest.fn().mockResolvedValue({ _id: validObjectId, humanId: 'MOD-10492', ...dto }),
    }));

    mockUserModel.findOne = jest.fn();
    mockUserModel.findById = jest.fn();
    mockUserModel.find = jest.fn();
    mockUserModel.countDocuments = jest.fn();
    mockUserModel.findByIdAndUpdate = jest.fn();
    mockUserModel.findByIdAndDelete = jest.fn();

    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };

    mockConnection = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };

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
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: AuditLogService,
          useValue: {
            record: jest.fn().mockResolvedValue(null),
          },
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
            email: 'admin@modus.local',
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
            email: 'existing@modus.local',
            firstName: 'Existing',
            lastName: 'User',
            role: Role.EMPLOYEE,
          },
          Role.SUPER_ADMIN,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should create user, generate humanId, dispatch credentials email, and commit transaction', async () => {
      mockUserModel.findOne
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(null), // humanId check
        })
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(null), // email check
        });

      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            _id: validObjectId,
            humanId: 'MOD-10492',
            email: 'new@modus.local',
            role: Role.EMPLOYEE,
          }),
        }),
      });

      const result = await service.createUser(
        {
          email: 'new@modus.local',
          firstName: 'New',
          lastName: 'User',
          role: Role.EMPLOYEE,
        },
        Role.SUPER_ADMIN,
      );

      expect(mockMailService.sendWelcomeCredentials).toHaveBeenCalledWith(
        'new@modus.local',
        'New',
        expect.stringMatching(/^[A-Z][a-z]{3,4}[@#$!%*]\d{3}$/),
        expect.stringMatching(/^MOD-\d{5}$/),
      );
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(result).toHaveProperty('email', 'new@modus.local');
      expect(result).toHaveProperty('humanId');
    });

    it('should abort transaction and not persist user if mail dispatch fails', async () => {
      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      mockMailService.sendWelcomeCredentials!.mockRejectedValue(
        new Error('SMTP delivery error'),
      );

      await expect(
        service.createUser(
          {
            email: 'failmail@modus.local',
            firstName: 'Fail',
            lastName: 'Mail',
            role: Role.EMPLOYEE,
          },
          Role.SUPER_ADMIN,
        ),
      ).rejects.toThrow('SMTP delivery error');

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });
  });

  describe('findByIdentifier', () => {
    it('should find user by email or humanId', async () => {
      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validObjectId,
          humanId: 'MOD-10492',
          email: 'user@modus.local',
          save: jest.fn().mockResolvedValue(true),
        }),
      });

      const user = await service.findByIdentifier('MOD-10492');
      expect(user).toHaveProperty('humanId', 'MOD-10492');
    });
  });

  describe('validateEmailDeliverability', () => {
    it('should accept valid format and skip DNS for test domains', async () => {
      await expect(
        service.validateEmailDeliverability('user@test.com'),
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
            humanId: 'MOD-10492',
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
