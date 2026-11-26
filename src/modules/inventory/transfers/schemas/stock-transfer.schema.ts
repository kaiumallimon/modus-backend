import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Product } from '../../products/schemas/product.schema';
import { Warehouse } from '../../warehouses/schemas/warehouse.schema';
import {
  InventoryActor,
  InventoryActorSchema,
} from '../../common/schemas/inventory-actor.schema';

export enum TransferStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
}

@Schema({ _id: false })
export class StockTransferItem {
  @Prop({ type: Types.ObjectId, ref: Product.name, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0.0001 })
  quantity: number;
}

export const StockTransferItemSchema =
  SchemaFactory.createForClass(StockTransferItem);

export type StockTransferDocument = HydratedDocument<StockTransfer>;

@Schema({ timestamps: true, collection: 'inventory_stock_transfers' })
export class StockTransfer {
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
    type: Types.ObjectId,
    ref: Warehouse.name,
    required: true,
    index: true,
  })
  sourceWarehouseId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: Warehouse.name,
    required: true,
    index: true,
  })
  destinationWarehouseId: Types.ObjectId;

  @Prop({ type: [StockTransferItemSchema], required: true })
  items: StockTransferItem[];

  @Prop({ type: String, default: '', trim: true })
  notes: string;

  @Prop({
    type: String,
    enum: Object.values(TransferStatus),
    required: true,
    default: TransferStatus.PENDING,
    index: true,
  })
  status: TransferStatus;

  @Prop({ type: InventoryActorSchema, required: true })
  createdBy: InventoryActor;

  @Prop({ type: InventoryActorSchema, default: null })
  confirmedBy: InventoryActor | null;

  @Prop({ type: Date, default: null })
  confirmedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const StockTransferSchema = SchemaFactory.createForClass(StockTransfer);
StockTransferSchema.index({ status: 1, createdAt: -1 });
StockTransferSchema.index({ createdAt: -1 });
