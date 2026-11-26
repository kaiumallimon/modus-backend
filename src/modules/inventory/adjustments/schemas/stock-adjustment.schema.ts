import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Product } from '../../products/schemas/product.schema';
import { Warehouse } from '../../warehouses/schemas/warehouse.schema';
import {
  InventoryActor,
  InventoryActorSchema,
} from '../../common/schemas/inventory-actor.schema';

export enum AdjustmentType {
  OPENING_STOCK = 'OPENING_STOCK',
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
}

export type StockAdjustmentDocument = HydratedDocument<StockAdjustment>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'inventory_stock_adjustments',
})
export class StockAdjustment {
  @Prop({
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  })
  referenceNumber: string;

  @Prop({
    type: String,
    required: false,
    unique: true,
    sparse: true,
    trim: true,
  })
  idempotencyKey?: string;

  @Prop({
    type: String,
    enum: Object.values(AdjustmentType),
    required: true,
    index: true,
  })
  adjustmentType: AdjustmentType;

  @Prop({
    type: Types.ObjectId,
    ref: Product.name,
    required: true,
    index: true,
  })
  productId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: Warehouse.name,
    required: true,
    index: true,
  })
  warehouseId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0.0001 })
  quantity: number;

  @Prop({ type: Number, required: true, min: 0 })
  previousQuantity: number;

  @Prop({ type: Number, required: true, min: 0 })
  resultingQuantity: number;

  @Prop({ type: String, required: true, trim: true })
  reason: string;

  @Prop({ type: String, default: '', trim: true })
  notes: string;

  @Prop({ type: InventoryActorSchema, required: true })
  createdBy: InventoryActor;

  createdAt?: Date;
}

export const StockAdjustmentSchema =
  SchemaFactory.createForClass(StockAdjustment);
StockAdjustmentSchema.index({ productId: 1, warehouseId: 1, createdAt: -1 });
StockAdjustmentSchema.index({ createdAt: -1 });
