import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Product } from '../../products/schemas/product.schema';
import { Warehouse } from '../../warehouses/schemas/warehouse.schema';

export type StockBalanceDocument = HydratedDocument<StockBalance>;

@Schema({ timestamps: true, collection: 'inventory_stock_balances' })
export class StockBalance {
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

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  quantity: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const StockBalanceSchema = SchemaFactory.createForClass(StockBalance);
StockBalanceSchema.index({ productId: 1, warehouseId: 1 }, { unique: true });
StockBalanceSchema.index({ warehouseId: 1, quantity: 1 });
