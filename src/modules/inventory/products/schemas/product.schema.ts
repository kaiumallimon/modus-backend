import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ProductCategory } from '../../categories/schemas/product-category.schema';
import { UnitOfMeasurement } from '../../units/schemas/unit-of-measurement.schema';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ timestamps: true, collection: 'inventory_products' })
export class Product {
  @Prop({ type: String, required: true, trim: true, index: true })
  name: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  })
  sku: string;

  @Prop({
    type: String,
    required: false,
    unique: true,
    sparse: true,
    trim: true,
  })
  barcode?: string;

  @Prop({ type: String, default: '', trim: true })
  description: string;

  @Prop({
    type: Types.ObjectId,
    ref: ProductCategory.name,
    required: true,
    index: true,
  })
  categoryId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: UnitOfMeasurement.name,
    required: true,
    index: true,
  })
  unitId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  costPrice: number;

  @Prop({ type: Number, default: null, min: 0 })
  sellingPrice: number | null;

  @Prop({ type: Number, default: 0, min: 0 })
  minStockThreshold: number;

  @Prop({ type: String, default: null })
  imageUrl: string | null;

  @Prop({ type: String, default: null })
  imageKey: string | null;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  archivedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ categoryId: 1, isActive: 1 });
ProductSchema.index({ isActive: 1, name: 1 });
