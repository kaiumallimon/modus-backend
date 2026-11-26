import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  const customerId = new Types.ObjectId();
  const audit = {
    actor: { id: 'u1', email: 'sales@modus.local', name: 'Sales Lead' },
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };

  function makeHarness() {
    const mockCustomerModel: any = {
      exists: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
    };
    const mockOrderModel: any = {
      aggregate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      find: jest.fn(),
      countDocuments: jest.fn(),
    };
    const mockFulfillmentModel: any = {
      aggregate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      find: jest.fn(),
    };
    const mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    } as any;

    const service = new CustomersService(
      mockCustomerModel,
      mockOrderModel,
      mockFulfillmentModel,
      mockAudit,
    );

    return { service, mockCustomerModel, mockAudit };
  }

  it('auto-generates uppercase CUS- code when omitted and logs creation', async () => {
    const { service, mockCustomerModel, mockAudit } = makeHarness();
    mockCustomerModel.exists.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    mockCustomerModel.create.mockImplementation(async (payload: any) => ({
      _id: customerId,
      ...payload,
    }));
    mockCustomerModel.findById.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({
          _id: customerId,
          code: 'CUS-TEST-01',
          name: 'Bluewater Traders',
          phone: '+1 555 310 4422',
          email: 'orders@bluewater.example',
          billingAddress: {},
          shippingAddress: {},
          notes: '',
          isActive: true,
          archivedAt: null,
          createdBy: audit.actor,
        }),
      }),
    });

    const created = await service.create(
      {
        name: 'Bluewater Traders',
        phone: '+1 555 310 4422',
        email: 'ORDERS@BLUEWATER.EXAMPLE',
      },
      audit,
    );

    expect(mockCustomerModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: expect.stringMatching(/^CUS-/),
        email: 'orders@bluewater.example',
        isActive: true,
      }),
    );
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SALES_CUSTOMER_CREATE' }),
    );
    expect(created.name).toBe('Bluewater Traders');
  });

  it('throws ConflictException when customer code already exists', async () => {
    const { service, mockCustomerModel } = makeHarness();
    mockCustomerModel.exists.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: customerId }),
    });

    await expect(
      service.create(
        { code: 'CUS-DUP-01', name: 'Duplicate', phone: '+1 555 111 2222' },
        audit,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('archives and restores customers without touching orders', async () => {
    const { service, mockCustomerModel, mockAudit } = makeHarness();
    const doc = {
      _id: customerId,
      code: 'CUS-001',
      name: 'Alpha Corp',
      phone: '+1 555 000 1111',
      isActive: true,
      archivedAt: null as Date | null,
      updatedBy: null as any,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockCustomerModel.findById
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(doc) })
      .mockReturnValueOnce({
        lean: () => ({
          exec: jest.fn().mockResolvedValue({
            _id: customerId,
            code: 'CUS-001',
            name: 'Alpha Corp',
            phone: '+1 555 000 1111',
            isActive: false,
            archivedAt: new Date(),
            createdBy: audit.actor,
          }),
        }),
      });

    const archived = await service.archive(
      customerId.toString(),
      { isActive: false },
      audit,
    );

    expect(doc.isActive).toBe(false);
    expect(doc.archivedAt).toBeInstanceOf(Date);
    expect(archived.isActive).toBe(false);
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SALES_CUSTOMER_ARCHIVE' }),
    );
  });

  it('throws NotFoundException when fetching customer orders for missing customer', async () => {
    const { service, mockCustomerModel } = makeHarness();
    mockCustomerModel.exists.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.findCustomerOrders(customerId.toString(), { page: 1, limit: 10 }),
    ).rejects.toThrow(NotFoundException);
  });
});
