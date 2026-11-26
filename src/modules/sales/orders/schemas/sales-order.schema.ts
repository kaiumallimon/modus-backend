import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SalesPricingAdjustmentType } from '../../common/utils/money.util';

export type SalesOrderDocument = HydratedDocument<SalesOrder>;

export enum SalesOrderStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  PARTIALLY_FULFILLED = 'PARTIALLY_FULFILLED',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
}

@Schema({ _id: false })
export class SalesOrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  productName: string;

  @Prop({ required: true, trim: true })
  sku: string;

  @Prop({ trim: true, default: 'Unit' })
  unitName: string;

  @Prop({ trim: true, default: 'unit' })
  unitSymbol: string;

  @Prop({ required: true, min: 0.0001 })
  orderedQuantity: number;

  @Prop({ required: true, default: 0, min: 0 })
  fulfilledQuantity: number;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({
    type: String,
    enum: SalesPricingAdjustmentType,
    default: SalesPricingAdjustmentType.FIXED,
  })
  discountType: SalesPricingAdjustmentType;

  @Prop({ default: 0, min: 0 })
  discountValue: number;

  @Prop({ default: 0, min: 0 })
  discountAmount: number;

  @Prop({
    type: String,
    enum: SalesPricingAdjustmentType,
    default: SalesPricingAdjustmentType.FIXED,
  })
  taxType: SalesPricingAdjustmentType;

  @Prop({ default: 0, min: 0 })
  taxValue: number;

  @Prop({ default: 0, min: 0 })
  taxAmount: number;

  @Prop({ required: true, min: 0 })
  lineSubtotal: number;

  @Prop({ required: true, min: 0 })
  lineTotal: number;
}

export const SalesOrderItemSchema =
  SchemaFactory.createForClass(SalesOrderItem);

@Schema({ timestamps: true, collection: 'sales_orders' })
export class SalesOrder {
  @Prop({
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    index: true,
  })
  orderNumber: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Customer',
    required: true,
    index: true,
  })
  customerId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  customerCodeSnapshot: string;

  @Prop({ required: true, trim: true })
  customerNameSnapshot: string;

  @Prop({ trim: true, default: '' })
  customerPhoneSnapshot: string;

  @Prop({ type: String, trim: true, default: null })
  customerEmailSnapshot: string | null;

  @Prop({
    type: Types.ObjectId,
    ref: 'Warehouse',
    required: true,
    index: true,
  })
  warehouseId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  warehouseNameSnapshot: string;

  @Prop({ type: Date, required: true, index: true })
  orderDate: Date;

  @Prop({ type: Date, default: null })
  expectedDeliveryDate?: Date | null;

  @Prop({ default: 'USD', trim: true, uppercase: true })
  currency: string;

  @Prop({ type: [SalesOrderItemSchema], required: true })
  items: SalesOrderItem[];

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ default: 0, min: 0 })
  discountTotal: number;

  @Prop({ default: 0, min: 0 })
  taxTotal: number;

  @Prop({ required: true, min: 0 })
  grandTotal: number;

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({
    type: String,
    enum: SalesOrderStatus,
    default: SalesOrderStatus.DRAFT,
    index: true,
  })
  status: SalesOrderStatus;

  @Prop({
    type: {
      id: { type: String, required: true },
      email: { type: String, required: true },
      name: { type: String },
    },
    required: true,
  })
  createdBy: { id: string; email: string; name?: string };

  @Prop({
    type: {
      id: { type: String, required: true },
      email: { type: String, required: true },
      name: { type: String },
    },
    default: null,
  })
  updatedBy?: { id: string; email: string; name?: string } | null;

  @Prop({
    type: {
      id: { type: String, required: true },
      email: { type: String, required: true },
      name: { type: String },
    },
    default: null,
  })
  confirmedBy?: { id: string; email: string; name?: string } | null;

  @Prop({ type: Date, default: null })
  confirmedAt?: Date | null;

  @Prop({
    type: {
      id: { type: String, required: true },
      email: { type: String, required: true },
      name: { type: String },
    },
    default: null,
  })
  cancelledBy?: { id: string; email: string; name?: string } | null;

  @Prop({ type: Date, default: null })
  cancelledAt?: Date | null;

  @Prop({ type: String, trim: true, default: null })
  cancellationReason?: string | null;

  @Prop({ type: Date, default: null })
  fulfilledCompletedAt?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SalesOrderSchema = SchemaFactory.createForClass(SalesOrder);

SalesOrderSchema.index({ status: 1, orderDate: -1 });
SalesOrderSchema.index({ customerId: 1, orderDate: -1 });
SalesOrderSchema.index({ warehouseId: 1, orderDate: -1 });
SalesOrderSchema.index({ createdAt: -1 });
