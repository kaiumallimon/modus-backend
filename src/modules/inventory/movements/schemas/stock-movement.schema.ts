import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Product } from '../../products/schemas/product.schema';
import { Warehouse } from '../../warehouses/schemas/warehouse.schema';
import {
  InventoryActor,
  InventoryActorSchema,
} from '../../common/schemas/inventory-actor.schema';

export enum StockMovementType {
  OPENING_STOCK = 'OPENING_STOCK',
  ADJUSTMENT_INCREASE = 'ADJUSTMENT_INCREASE',
  ADJUSTMENT_DECREASE = 'ADJUSTMENT_DECREASE',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
}

export enum MovementReferenceType {
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER = 'TRANSFER',
}

export type StockMovementDocument = HydratedDocument<StockMovement>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'inventory_stock_movements',
})
export class StockMovement {
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

  @Prop({
    type: String,
    enum: Object.values(StockMovementType),
    required: true,
    index: true,
  })
  movementType: StockMovementType;

  @Prop({ type: Number, required: true })
  quantityChange: number;

  @Prop({ type: Number, required: true, min: 0 })
  previousBalance: number;

  @Prop({ type: Number, required: true, min: 0 })
  resultingBalance: number;

  @Prop({
    type: String,
    enum: Object.values(MovementReferenceType),
    required: true,
    index: true,
  })
  referenceType: MovementReferenceType;

  @Prop({ type: String, required: true, index: true })
  referenceId: string;

  @Prop({ type: String, required: true })
  referenceNumber: string;

  @Prop({ type: String, required: true, trim: true })
  description: string;

  @Prop({ type: InventoryActorSchema, required: true })
  actor: InventoryActor;

  createdAt?: Date;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);
StockMovementSchema.index({ createdAt: -1 });
StockMovementSchema.index({ productId: 1, createdAt: -1 });
StockMovementSchema.index({ warehouseId: 1, createdAt: -1 });
StockMovementSchema.index({ movementType: 1, createdAt: -1 });
StockMovementSchema.index({ referenceType: 1, referenceId: 1 });
StockMovementSchema.index({ referenceNumber: 1 });
