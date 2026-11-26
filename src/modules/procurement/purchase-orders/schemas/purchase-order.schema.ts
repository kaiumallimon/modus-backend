import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Supplier } from '../../suppliers/schemas/supplier.schema';
import { Product } from '../../../inventory/products/schemas/product.schema';
import { Warehouse } from '../../../inventory/warehouses/schemas/warehouse.schema';
import {
  InventoryActor,
  InventoryActorSchema,
} from '../../../inventory/common/schemas/inventory-actor.schema';
import { PricingAdjustmentType } from '../../common/utils/money.util';
import { PROCUREMENT_APP_CURRENCY } from '../../common/constants/procurement-permissions.constant';

export enum PurchaseOrderStatus {
  DRAFT = 'DRAFT',
  ORDERED = 'ORDERED',
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

@Schema({ _id: false })
export class PurchaseOrderItem {
  @Prop({ type: Types.ObjectId, ref: Product.name, required: true })
  productId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  productName: string;

  @Prop({ type: String, required: true, trim: true })
  sku: string;

  @Prop({ type: String, default: '', trim: true })
  unitName: string;

  @Prop({ type: String, default: '', trim: true })
  unitSymbol: string;

  @Prop({ type: Number, required: true, min: 0.0001 })
  orderedQuantity: number;

  @Prop({ type: Number, default: 0, min: 0 })
  receivedQuantity: number;

  @Prop({ type: Number, required: true, min: 0 })
  unitPrice: number;

  @Prop({
    type: String,
    enum: Object.values(PricingAdjustmentType),
    default: PricingAdjustmentType.FIXED,
  })
  discountType: PricingAdjustmentType;

  @Prop({ type: Number, default: 0, min: 0 })
  discountValue: number;

  @Prop({ type: Number, default: 0, min: 0 })
  discountAmount: number;

  @Prop({
    type: String,
    enum: Object.values(PricingAdjustmentType),
    default: PricingAdjustmentType.FIXED,
  })
  taxType: PricingAdjustmentType;

  @Prop({ type: Number, default: 0, min: 0 })
  taxValue: number;

  @Prop({ type: Number, default: 0, min: 0 })
  taxAmount: number;

  @Prop({ type: Number, required: true, min: 0 })
  lineSubtotal: number;

  @Prop({ type: Number, required: true, min: 0 })
  lineTotal: number;
}

export const PurchaseOrderItemSchema =
  SchemaFactory.createForClass(PurchaseOrderItem);

export type PurchaseOrderDocument = HydratedDocument<PurchaseOrder>;

@Schema({ timestamps: true, collection: 'procurement_purchase_orders' })
export class PurchaseOrder {
  @Prop({
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  })
  orderNumber: string;

  @Prop({
    type: Types.ObjectId,
    ref: Supplier.name,
    required: true,
    index: true,
  })
  supplierId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  supplierNameSnapshot: string;

  @Prop({ type: String, required: true, trim: true })
  supplierCodeSnapshot: string;

  @Prop({
    type: Types.ObjectId,
    ref: Warehouse.name,
    required: true,
    index: true,
  })
  destinationWarehouseId: Types.ObjectId;

  @Prop({ type: Date, required: true, index: true })
  orderDate: Date;

  @Prop({ type: Date, default: null })
  expectedDeliveryDate: Date | null;

  @Prop({ type: String, default: PROCUREMENT_APP_CURRENCY })
  currency: string;

  @Prop({ type: [PurchaseOrderItemSchema], required: true })
  items: PurchaseOrderItem[];

  @Prop({ type: Number, required: true, min: 0 })
  subtotal: number;

  @Prop({ type: Number, default: 0, min: 0 })
  discountTotal: number;

  @Prop({ type: Number, default: 0, min: 0 })
  taxTotal: number;

  @Prop({ type: Number, required: true, min: 0 })
  grandTotal: number;

  @Prop({
    type: String,
    enum: Object.values(PurchaseOrderStatus),
    default: PurchaseOrderStatus.DRAFT,
    index: true,
  })
  status: PurchaseOrderStatus;

  @Prop({ type: String, default: '', trim: true })
  notes?: string;

  @Prop({ type: InventoryActorSchema, required: true })
  createdBy: InventoryActor;

  @Prop({ type: InventoryActorSchema, default: null })
  submittedBy?: InventoryActor | null;

  @Prop({ type: Date, default: null })
  submittedAt?: Date | null;

  @Prop({ type: InventoryActorSchema, default: null })
  cancelledBy?: InventoryActor | null;

  @Prop({ type: Date, default: null })
  cancelledAt?: Date | null;

  @Prop({ type: String, default: '', trim: true })
  cancellationReason?: string;

  @Prop({ type: Date, default: null })
  receivedCompletedAt?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);
PurchaseOrderSchema.index({ status: 1, createdAt: -1 });
PurchaseOrderSchema.index({ supplierId: 1, createdAt: -1 });
PurchaseOrderSchema.index({ destinationWarehouseId: 1, status: 1 });
PurchaseOrderSchema.index({ orderDate: -1 });
