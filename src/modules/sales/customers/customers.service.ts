import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import type { AuditActorMeta } from '../../inventory/categories/categories.service';
import { BasePaginationQueryDto } from '../../inventory/common/dto/pagination-query.dto';
import {
  buildPaginationMeta,
  ensureValidObjectId,
  escapeRegex,
  generateReferenceNumber,
} from '../../inventory/common/utils/transaction.util';
import {
  SalesFulfillment,
  SalesFulfillmentDocument,
} from '../fulfillments/schemas/sales-fulfillment.schema';
import {
  SalesOrder,
  SalesOrderDocument,
  SalesOrderStatus,
} from '../orders/schemas/sales-order.schema';
import {
  ArchiveCustomerDto,
  CreateCustomerDto,
  CustomerAddressDto,
  QueryCustomerDto,
  UpdateCustomerDto,
} from './dto/customer.dto';
import {
  Customer,
  CustomerAddress,
  CustomerDocument,
} from './schemas/customer.schema';

function normalizeAddress(addr?: CustomerAddressDto): CustomerAddress {
  return {
    street: addr?.street?.trim() || '',
    city: addr?.city?.trim() || '',
    state: addr?.state?.trim() || '',
    postalCode: addr?.postalCode?.trim() || '',
    country: addr?.country?.trim() || '',
  };
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(SalesOrder.name)
    private readonly orderModel: Model<SalesOrderDocument>,
    @InjectModel(SalesFulfillment.name)
    private readonly fulfillmentModel: Model<SalesFulfillmentDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(dto: CreateCustomerDto, audit: AuditActorMeta) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : generateReferenceNumber('CUS');

    const duplicate = await this.customerModel
      .exists({ code })
      .exec();
    if (duplicate) {
      throw new ConflictException(`Customer code '${code}' already exists`);
    }

    const doc = await this.customerModel.create({
      code,
      name: dto.name.trim(),
      phone: dto.phone.trim(),
      email: dto.email?.trim() ? dto.email.trim().toLowerCase() : null,
      billingAddress: normalizeAddress(dto.billingAddress),
      shippingAddress: normalizeAddress(dto.shippingAddress),
      notes: dto.notes?.trim() || '',
      isActive: true,
      archivedAt: null,
      createdBy: audit.actor,
      updatedBy: null,
    });

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'SALES_CUSTOMER_CREATE',
      resource: 'sales',
      resourceId: doc._id.toString(),
      description: `Created customer ${doc.name} (${doc.code})`,
      metadata: {
        customerId: doc._id.toString(),
        code: doc.code,
        name: doc.name,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(doc._id.toString());
  }

  async findAll(query: QueryCustomerDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    const search = query.search?.trim();
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { code: regex },
        { name: regex },
        { phone: regex },
        { email: regex },
      ];
    }

    const sortField = query.sortBy ?? 'createdAt';
    const sortDir = query.sortOrder === 'asc' ? 1 : -1;

    const [items, total] = await Promise.all([
      this.customerModel
        .find(filter)
        .sort({ [sortField]: sortDir, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.customerModel.countDocuments(filter).exec(),
    ]);

    const customerIds = items.map((c) => c._id);
    const statsAgg = customerIds.length
      ? await this.orderModel
          .aggregate<{
            _id: Types.ObjectId;
            orderCount: number;
            confirmedOrActiveValue: number;
          }>([
            {
              $match: {
                customerId: { $in: customerIds },
                status: { $ne: SalesOrderStatus.CANCELLED },
              },
            },
            {
              $group: {
                _id: '$customerId',
                orderCount: { $sum: 1 },
                confirmedOrActiveValue: {
                  $sum: {
                    $cond: [
                      { $ne: ['$status', SalesOrderStatus.DRAFT] },
                      '$grandTotal',
                      0,
                    ],
                  },
                },
              },
            },
          ])
          .exec()
      : [];

    const fulfilledAgg = customerIds.length
      ? await this.fulfillmentModel
          .aggregate<{
            _id: Types.ObjectId;
            fulfilledValue: number;
            fulfillmentCount: number;
          }>([
            { $match: { customerId: { $in: customerIds } } },
            {
              $group: {
                _id: '$customerId',
                fulfilledValue: { $sum: '$totalFulfilledValue' },
                fulfillmentCount: { $sum: 1 },
              },
            },
          ])
          .exec()
      : [];

    const orderStatMap = new Map(
      statsAgg.map((row) => [row._id.toString(), row]),
    );
    const fulfilledMap = new Map(
      fulfilledAgg.map((row) => [row._id.toString(), row]),
    );

    const enriched = items.map((c) => {
      const idStr = c._id.toString();
      const orderStat = orderStatMap.get(idStr);
      const fulfilledStat = fulfilledMap.get(idStr);
      return {
        _id: c._id,
        code: c.code,
        name: c.name,
        phone: c.phone,
        email: c.email,
        billingAddress: c.billingAddress,
        shippingAddress: c.shippingAddress,
        notes: c.notes,
        isActive: c.isActive,
        archivedAt: c.archivedAt ?? null,
        createdBy: c.createdBy,
        updatedBy: c.updatedBy ?? null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        stats: {
          orderCount: orderStat?.orderCount ?? 0,
          committedValue:
            Math.round((orderStat?.confirmedOrActiveValue ?? 0) * 100) / 100,
          fulfilledValue:
            Math.round((fulfilledStat?.fulfilledValue ?? 0) * 100) / 100,
          fulfillmentCount: fulfilledStat?.fulfillmentCount ?? 0,
        },
      };
    });

    return {
      items: enriched,
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(id: string) {
    const objId = ensureValidObjectId(id, 'customer');
    const customer = await this.customerModel.findById(objId).lean().exec();
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const [orderAgg, fulfilledAgg] = await Promise.all([
      this.orderModel
        .aggregate<{
          _id: null;
          totalOrders: number;
          draftOrders: number;
          confirmedOrders: number;
          fulfilledOrders: number;
          cancelledOrders: number;
          committedValue: number;
        }>([
          { $match: { customerId: objId } },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              draftOrders: {
                $sum: {
                  $cond: [{ $eq: ['$status', SalesOrderStatus.DRAFT] }, 1, 0],
                },
              },
              confirmedOrders: {
                $sum: {
                  $cond: [
                    {
                      $in: [
                        '$status',
                        [
                          SalesOrderStatus.CONFIRMED,
                          SalesOrderStatus.PARTIALLY_FULFILLED,
                        ],
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              fulfilledOrders: {
                $sum: {
                  $cond: [
                    { $eq: ['$status', SalesOrderStatus.FULFILLED] },
                    1,
                    0,
                  ],
                },
              },
              cancelledOrders: {
                $sum: {
                  $cond: [
                    { $eq: ['$status', SalesOrderStatus.CANCELLED] },
                    1,
                    0,
                  ],
                },
              },
              committedValue: {
                $sum: {
                  $cond: [
                    {
                      $in: [
                        '$status',
                        [
                          SalesOrderStatus.CONFIRMED,
                          SalesOrderStatus.PARTIALLY_FULFILLED,
                          SalesOrderStatus.FULFILLED,
                        ],
                      ],
                    },
                    '$grandTotal',
                    0,
                  ],
                },
              },
            },
          },
        ])
        .exec(),
      this.fulfillmentModel
        .aggregate<{
          _id: null;
          fulfillmentCount: number;
          fulfilledUnits: number;
          fulfilledValue: number;
          lastFulfilledAt: Date | null;
        }>([
          { $match: { customerId: objId } },
          {
            $group: {
              _id: null,
              fulfillmentCount: { $sum: 1 },
              fulfilledUnits: { $sum: '$totalFulfilledUnits' },
              fulfilledValue: { $sum: '$totalFulfilledValue' },
              lastFulfilledAt: { $max: '$fulfilledDate' },
            },
          },
        ])
        .exec(),
    ]);

    const orderStats = orderAgg[0];
    const fulfilledStats = fulfilledAgg[0];

    return {
      _id: customer._id,
      code: customer.code,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      billingAddress: customer.billingAddress,
      shippingAddress: customer.shippingAddress,
      notes: customer.notes,
      isActive: customer.isActive,
      archivedAt: customer.archivedAt ?? null,
      createdBy: customer.createdBy,
      updatedBy: customer.updatedBy ?? null,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      stats: {
        totalOrders: orderStats?.totalOrders ?? 0,
        draftOrders: orderStats?.draftOrders ?? 0,
        confirmedOrders: orderStats?.confirmedOrders ?? 0,
        fulfilledOrders: orderStats?.fulfilledOrders ?? 0,
        cancelledOrders: orderStats?.cancelledOrders ?? 0,
        committedValue:
          Math.round((orderStats?.committedValue ?? 0) * 100) / 100,
        fulfillmentCount: fulfilledStats?.fulfillmentCount ?? 0,
        fulfilledUnits:
          Math.round((fulfilledStats?.fulfilledUnits ?? 0) * 10000) / 10000,
        fulfilledValue:
          Math.round((fulfilledStats?.fulfilledValue ?? 0) * 100) / 100,
        lastFulfilledAt: fulfilledStats?.lastFulfilledAt ?? null,
      },
    };
  }

  async update(id: string, dto: UpdateCustomerDto, audit: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'customer');
    const existing = await this.customerModel.findById(objId).exec();
    if (!existing) {
      throw new NotFoundException('Customer not found');
    }

    if (dto.code !== undefined && dto.code.trim()) {
      const normalizedCode = dto.code.trim().toUpperCase();
      if (normalizedCode !== existing.code) {
        const duplicate = await this.customerModel
          .exists({ code: normalizedCode, _id: { $ne: objId } })
          .exec();
        if (duplicate) {
          throw new ConflictException(
            `Customer code '${normalizedCode}' already exists`,
          );
        }
        existing.code = normalizedCode;
      }
    }

    if (dto.name !== undefined) existing.name = dto.name.trim();
    if (dto.phone !== undefined) existing.phone = dto.phone.trim();
    if (dto.email !== undefined) {
      existing.email = dto.email?.trim()
        ? dto.email.trim().toLowerCase()
        : null;
    }
    if (dto.billingAddress !== undefined) {
      existing.billingAddress = normalizeAddress(dto.billingAddress);
    }
    if (dto.shippingAddress !== undefined) {
      existing.shippingAddress = normalizeAddress(dto.shippingAddress);
    }
    if (dto.notes !== undefined) existing.notes = dto.notes.trim();

    existing.updatedBy = audit.actor;
    await existing.save();

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'SALES_CUSTOMER_UPDATE',
      resource: 'sales',
      resourceId: existing._id.toString(),
      description: `Updated customer ${existing.name} (${existing.code})`,
      metadata: {
        customerId: existing._id.toString(),
        code: existing.code,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(existing._id.toString());
  }

  async archive(
    id: string,
    dto: ArchiveCustomerDto | undefined,
    audit: AuditActorMeta,
  ) {
    const objId = ensureValidObjectId(id, 'customer');
    const existing = await this.customerModel.findById(objId).exec();
    if (!existing) {
      throw new NotFoundException('Customer not found');
    }

    const nextActive = dto?.isActive ?? false;
    existing.isActive = nextActive;
    existing.archivedAt = nextActive ? null : new Date();
    existing.updatedBy = audit.actor;
    await existing.save();

    await this.auditLogService.record({
      actor: audit.actor,
      action: nextActive ? 'SALES_CUSTOMER_RESTORE' : 'SALES_CUSTOMER_ARCHIVE',
      resource: 'sales',
      resourceId: existing._id.toString(),
      description: `${nextActive ? 'Restored' : 'Archived'} customer ${existing.name} (${existing.code})`,
      metadata: {
        customerId: existing._id.toString(),
        code: existing.code,
        isActive: nextActive,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(existing._id.toString());
  }

  async findCustomerOrders(id: string, query: BasePaginationQueryDto) {
    const objId = ensureValidObjectId(id, 'customer');
    const exists = await this.customerModel.exists({ _id: objId }).exec();
    if (!exists) {
      throw new NotFoundException('Customer not found');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { customerId: objId };
    const search = query.search?.trim();
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ orderNumber: regex }, { notes: regex }];
    }

    const [orders, total, fulfillments] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ orderDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('warehouseId', 'name code')
        .lean()
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
      this.fulfillmentModel
        .find({ customerId: objId })
        .sort({ fulfilledDate: -1, createdAt: -1 })
        .limit(50)
        .lean()
        .exec(),
    ]);

    return {
      items: orders,
      fulfillments,
      pagination: buildPaginationMeta(total, page, limit),
    };
  }
}
