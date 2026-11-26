import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let mockCategoryModel: any;
  let mockProductModel: any;
  let mockAuditLogService: any;

  const validId = new Types.ObjectId().toString();

  beforeEach(() => {
    mockCategoryModel = {
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

    service = new CategoriesService(
      mockCategoryModel,
      mockProductModel,
      mockAuditLogService,
    );
  });

  it('prevents duplicate category creation (case-insensitive)', async () => {
    mockCategoryModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: validId, name: 'Antibiotics' }),
    });

    await expect(
      service.create({ name: 'antibiotics' }),
    ).rejects.toThrow(ConflictException);
  });

  it('prevents destructive deletion when products depend on the category', async () => {
    mockCategoryModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(validId), name: 'Consumables' }),
    });
    mockProductModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(3),
    });
    mockCategoryModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });

    await expect(service.remove(validId)).rejects.toThrow(BadRequestException);
    expect(mockCategoryModel.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('archives category safely without deletion', async () => {
    const doc = {
      _id: new Types.ObjectId(validId),
      name: 'Consumables',
      isActive: true,
      archivedAt: null,
      save: jest.fn().mockResolvedValue(undefined),
      toObject: () => ({ _id: validId, name: 'Consumables', isActive: false }),
    };
    mockCategoryModel.findById
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(doc) })
      .mockReturnValueOnce({
        populate: () => ({ exec: jest.fn().mockResolvedValue(doc) }),
      });
    mockProductModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(2),
    });

    const result = await service.archive(validId, {
      actor: { id: 'u1', email: 'admin@modus.local' },
    });

    expect(doc.isActive).toBe(false);
    expect(doc.save).toHaveBeenCalled();
    expect(mockAuditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INVENTORY_CATEGORY_ARCHIVE' }),
    );
    expect(result.productCount).toBe(2);
  });
});
