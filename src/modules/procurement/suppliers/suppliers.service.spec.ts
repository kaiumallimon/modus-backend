import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { SuppliersService } from './suppliers.service';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let mockSupplierModel: any;
  let mockPoModel: any;
  let mockReceiptModel: any;
  let mockAuditLogService: any;

  const supId = new Types.ObjectId();
  const actor = {
    actor: { id: 'u1', email: 'admin@modus.local', role: 'SUPER_ADMIN' },
  };

  beforeEach(() => {
    mockSupplierModel = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      findById: jest.fn(),
      create: jest.fn(),
      deleteOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ deletedCount: 1 }) }),
    };
    mockPoModel = {
      find: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      }),
      aggregate: jest.fn().mockResolvedValue([]),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
    };
    mockReceiptModel = {
      find: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      }),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
    };
    mockAuditLogService = { record: jest.fn().mockResolvedValue(null) };

    service = new SuppliersService(
      mockSupplierModel,
      mockPoModel,
      mockReceiptModel,
      mockAuditLogService,
    );
  });

  it('creates a supplier with uppercased unique code and logs audit event', async () => {
    const createdDoc = {
      _id: supId,
      name: 'Acme Pharma',
      code: 'SUP-ACME',
      email: 'sales@acme.test',
    };
    mockSupplierModel.create.mockResolvedValue(createdDoc);
    mockSupplierModel.findById.mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(createdDoc),
      }),
    });

    const res = await service.create(
      {
        name: 'Acme Pharma',
        code: 'sup-acme',
        contactPerson: 'Ali',
        email: 'Sales@Acme.test',
        phone: '+1 555 201 9900',
      },
      actor,
    );

    expect(res.code).toBe('SUP-ACME');
    expect(mockSupplierModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SUP-ACME',
        email: 'sales@acme.test',
        isActive: true,
      }),
    );
    expect(mockAuditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROCUREMENT_SUPPLIER_CREATE',
        resource: 'procurement',
      }),
    );
  });

  it('rejects duplicate supplier code with ConflictException', async () => {
    mockSupplierModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: supId, code: 'SUP-ACME' }),
    });

    await expect(
      service.create(
        {
          name: 'Duplicate',
          code: 'SUP-ACME',
          contactPerson: 'Ali',
          email: 'a@b.com',
          phone: '+1 555 201 9900',
        },
        actor,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('deactivates supplier cleanly without deleting historical data', async () => {
    const doc = {
      _id: supId,
      name: 'Acme Pharma',
      code: 'SUP-ACME',
      isActive: true,
      deactivatedAt: null,
      save: jest.fn().mockResolvedValue(true),
    };
    mockSupplierModel.findById
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(doc) })
      .mockReturnValueOnce({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ ...doc, isActive: false }),
        }),
      });

    const res = await service.deactivate(supId.toString(), actor);
    expect(doc.isActive).toBe(false);
    expect(res.isActive).toBe(false);
    expect(mockAuditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PROCUREMENT_SUPPLIER_DEACTIVATE' }),
    );
  });

  it('prevents hard-deletion when purchase orders reference the supplier', async () => {
    mockSupplierModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: supId, name: 'Acme', code: 'SUP-ACME' }),
    });
    mockPoModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(2),
    });

    await expect(service.remove(supId.toString(), actor)).rejects.toThrow(
      BadRequestException,
    );
    expect(mockSupplierModel.deleteOne).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for non-existent supplier', async () => {
    mockSupplierModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(service.deactivate(supId.toString(), actor)).rejects.toThrow(
      NotFoundException,
    );
  });
});
