import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DEFAULT_UNITS_SEED, UnitsService } from './units.service';

describe('UnitsService', () => {
  let service: UnitsService;
  let mockUnitModel: any;
  let mockProductModel: any;
  let mockAuditLogService: any;

  const validId = new Types.ObjectId().toString();

  beforeEach(() => {
    mockUnitModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      create: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };
    mockProductModel = {
      countDocuments: jest.fn(),
      aggregate: jest.fn().mockResolvedValue([]),
    };
    mockAuditLogService = { record: jest.fn().mockResolvedValue(null) };

    service = new UnitsService(
      mockUnitModel,
      mockProductModel,
      mockAuditLogService,
    );
  });

  it('seeds common units idempotently without duplicating existing entries', async () => {
    let createdCount = 0;
    mockUnitModel.findOne.mockImplementation(({ $or }: any) => ({
      exec: jest.fn().mockResolvedValue(
        $or?.[0]?.normalizedName === 'piece' ? { name: 'Piece' } : null,
      ),
    }));
    mockUnitModel.create.mockImplementation(async () => {
      createdCount++;
      return {};
    });

    await service.seedDefaultUnits();
    expect(createdCount).toBe(DEFAULT_UNITS_SEED.length - 1);
  });

  it('rejects duplicate unit symbols', async () => {
    mockUnitModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        normalizedName: 'kilogram',
        normalizedSymbol: 'kg',
      }),
    });

    await expect(
      service.create({ name: 'Kilo', symbol: 'KG' }),
    ).rejects.toThrow(ConflictException);
  });

  it('prevents destructive deletion when products reference the unit', async () => {
    mockUnitModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(validId),
        name: 'Piece',
        symbol: 'pcs',
      }),
    });
    mockProductModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(4),
    });

    await expect(service.remove(validId)).rejects.toThrow(BadRequestException);
    expect(mockUnitModel.findByIdAndDelete).not.toHaveBeenCalled();
  });
});
