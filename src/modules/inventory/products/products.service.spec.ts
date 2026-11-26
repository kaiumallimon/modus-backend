import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let mockProductModel: any;
  let mockCategoryModel: any;
  let mockUnitModel: any;
  let mockBalanceModel: any;
  let mockMovementModel: any;
  let mockStorageService: any;
  let mockAuditLogService: any;

  const prodId = new Types.ObjectId().toString();
  const catId = new Types.ObjectId().toString();
  const unitId = new Types.ObjectId().toString();

  beforeEach(() => {
    mockProductModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };
    mockCategoryModel = { findById: jest.fn() };
    mockUnitModel = { findById: jest.fn() };
    mockBalanceModel = { countDocuments: jest.fn(), find: jest.fn() };
    mockMovementModel = { countDocuments: jest.fn(), find: jest.fn() };
    mockStorageService = { uploadAsset: jest.fn(), deleteObjects: jest.fn() };
    mockAuditLogService = { record: jest.fn().mockResolvedValue(null) };

    service = new ProductsService(
      mockProductModel,
      mockCategoryModel,
      mockUnitModel,
      mockBalanceModel,
      mockMovementModel,
      mockStorageService,
      mockAuditLogService,
    );
  });

  it('rejects duplicate SKU creation', async () => {
    mockProductModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sku: 'MED-001' }),
    });

    await expect(
      service.create({
        name: 'Bandage',
        sku: 'med-001',
        categoryId: catId,
        unitId,
        costPrice: 5,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('archives instead of hard-deleting when product has historical stock or movements', async () => {
    const productDoc = {
      _id: new Types.ObjectId(prodId),
      name: 'Syringe 5mL',
      sku: 'SYR-5ML',
      isActive: true,
      archivedAt: null,
      save: jest.fn().mockResolvedValue(undefined),
      toObject: () => ({
        _id: prodId,
        name: 'Syringe 5mL',
        sku: 'SYR-5ML',
        isActive: false,
      }),
    };

    mockProductModel.findById
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(productDoc) })
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(productDoc) })
      .mockReturnValueOnce({
        populate: () => ({
          populate: () => ({ exec: jest.fn().mockResolvedValue(productDoc) }),
        }),
      });
    mockBalanceModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(1),
    });
    mockMovementModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(2),
    });
    mockBalanceModel.find.mockReturnValue({
      populate: () => ({ sort: () => ({ exec: jest.fn().mockResolvedValue([]) }) }),
    });
    mockMovementModel.find.mockReturnValue({
      populate: () => ({
        sort: () => ({ limit: () => ({ exec: jest.fn().mockResolvedValue([]) }) }),
      }),
    });

    const result: any = await service.remove(prodId, {
      actor: { id: 'u1', email: 'admin@modus.local' },
    });

    expect(mockProductModel.findByIdAndDelete).not.toHaveBeenCalled();
    expect(productDoc.isActive).toBe(false);
    expect(result.isActive).toBe(false);
    expect(mockAuditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INVENTORY_PRODUCT_ARCHIVE' }),
    );
  });
});
