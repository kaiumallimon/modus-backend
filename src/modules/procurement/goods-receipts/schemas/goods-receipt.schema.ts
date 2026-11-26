import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PurchaseOrder } from '../../purchase-orders/schemas/purchase-order.schema';
import { Supplier } from '../../suppliers/schemas/supplier.schema';
import { Product } from '../../../inventory/products/schemas/product.schema';
import { Warehouse } from '../../../inventory/warehouses/schemas/warehouse.schema';
import {
  InventoryActor,
  InventoryActorSchema,
} from '../../../inventory/common/schemas/inventory-actor.schema';
import { PROCUREMENT_APP_CURRENCY } from '../../common/constants/procurement-permissions.constant';

export enum GoodsReceiptStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
}

@Schema({ _id: false })
export class GoodsReceiptItem {
  @Prop({ type: Types.ObjectId, ref: Product.name, required: true })
  productId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  productName: string;

  @Prop({ type: String, required: true, trim: true })
  sku: string;

  @Prop({ type: String, default: '', trim: true })
  unitSymbol: string;

  @Prop({ type: Number, required: true, min: 0.0001 })
  orderedQuantity: number;

  @Prop({ type: Number, required: true, min: 0 })
  previouslyReceivedQuantity: number;

  @Prop({ type: Number, required: true, min: 0.0001 })
  receivedQuantity: number;

  @Prop({ type: Number, required: true, min: 0 })
  remainingQuantity: number;

  @Prop({ type: Number, required: true, min: 0 })
  unitPrice: number;

  @Prop({ type: Number, required: true, min: 0 })
  lineReceivedAmount: number;
}

export const GoodsReceiptItemSchema =
  SchemaFactory.createForClass(GoodsReceiptItem);

export type GoodsReceiptDocument = HydratedDocument<GoodsReceipt>;

@Schema({ timestamps: true, collection: 'procurement_goods_receipts' })
export class GoodsReceipt {
  @Prop({
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  })
  receiptNumber: string;

  @Prop({
    type: String,
    required: false,
    unique: true,
    sparse: true,
    trim: true,
  })
  idempotencyKey?: string;

  @Prop({
    type: Types.ObjectId,
    ref: PurchaseOrder.name,
    required: true,
    index: true,
  })
  purchaseOrderId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  purchaseOrderNumber: string;

  @Prop({
    type: Types.ObjectId,
    ref: Supplier.name,
    required: true,
    index: true,
  })
  supplierId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: Warehouse.name,
    required: true,
    index: true,
  })
  destinationWarehouseId: Types.ObjectId;

  @Prop({ type: Date, required: true, index: true })
  receivedDate: Date;

  @Prop({
    type: String,
    enum: Object.values(GoodsReceiptStatus),
    default: GoodsReceiptStatus.DRAFT,
    index: true,
  })
  status: GoodsReceiptStatus;

  @Prop({ type: [GoodsReceiptItemSchema], required: true })
  items: GoodsReceiptItem[];

  @Prop({ type: Number, required: true, min: 0 })
  totalReceivedUnits: number;

  @Prop({ type: String, default: PROCUREMENT_APP_CURRENCY })
  currency: string;

  @Prop({ type: Number, required: true, min: 0 })
  totalReceivedValue: number;

  @Prop({ type: String, default: '', trim: true })
  notes?: string;

  @Prop({ type: InventoryActorSchema, required: true })
  createdBy: InventoryActor;

  @Prop({ type: InventoryActorSchema, default: null })
  confirmedBy?: InventoryActor | null;

  @Prop({ type: Date, default: null })
  confirmedAt?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const GoodsReceiptSchema = SchemaFactory.createForClass(GoodsReceipt);
GoodsReceiptSchema.index({ purchaseOrderId: 1, createdAt: -1 });
GoodsReceiptSchema.index({ supplierId: 1, receivedDate: -1 });
GoodsReceiptSchema.index({ destinationWarehouseId: 1, receivedDate: -1 });
GoodsReceiptSchema.index({ status: 1, createdAt: -1 });
