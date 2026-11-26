import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SalesFulfillmentDocument = HydratedDocument<SalesFulfillment>;

@Schema({ _id: false })
export class SalesFulfillmentItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  productName: string;

  @Prop({ required: true, trim: true })
  sku: string;

  @Prop({ trim: true, default: 'unit' })
  unitSymbol: string;

  @Prop({ required: true, min: 0.0001 })
  orderedQuantity: number;

  @Prop({ required: true, min: 0 })
  previouslyFulfilledQuantity: number;

  @Prop({ required: true, min: 0.0001 })
  fulfilledQuantity: number;

  @Prop({ required: true, min: 0 })
  remainingQuantity: number;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ required: true, min: 0 })
  lineFulfilledAmount: number;
}

export const SalesFulfillmentItemSchema =
  SchemaFactory.createForClass(SalesFulfillmentItem);

@Schema({ timestamps: true, collection: 'sales_fulfillments' })
export class SalesFulfillment {
  @Prop({
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    index: true,
  })
  fulfillmentNumber: string;

  @Prop({ type: String, trim: true, sparse: true, unique: true })
  idempotencyKey?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'SalesOrder',
    required: true,
    index: true,
  })
  salesOrderId: Types.ObjectId;

  @Prop({ required: true, trim: true, uppercase: true })
  salesOrderNumber: string;

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
  fulfilledDate: Date;

  @Prop({ type: [SalesFulfillmentItemSchema], required: true })
  items: SalesFulfillmentItem[];

  @Prop({ required: true, min: 0.0001 })
  totalFulfilledUnits: number;

  @Prop({ default: 'USD', trim: true, uppercase: true })
  currency: string;

  @Prop({ required: true, min: 0 })
  totalFulfilledValue: number;

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({
    type: {
      id: { type: String, required: true },
      email: { type: String, required: true },
      name: { type: String },
    },
    required: true,
  })
  createdBy: { id: string; email: string; name?: string };

  createdAt?: Date;
  updatedAt?: Date;
}

export const SalesFulfillmentSchema =
  SchemaFactory.createForClass(SalesFulfillment);

SalesFulfillmentSchema.index({ salesOrderId: 1, createdAt: -1 });
SalesFulfillmentSchema.index({ customerId: 1, fulfilledDate: -1 });
SalesFulfillmentSchema.index({ fulfilledDate: -1 });
SalesFulfillmentSchema.index({ createdAt: -1 });
