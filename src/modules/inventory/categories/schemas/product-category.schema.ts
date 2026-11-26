import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProductCategoryDocument = HydratedDocument<ProductCategory>;

@Schema({ timestamps: true, collection: 'inventory_categories' })
export class ProductCategory {
  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  normalizedName: string;

  @Prop({ type: String, default: '', trim: true })
  description: string;

  @Prop({
    type: Types.ObjectId,
    ref: ProductCategory.name,
    default: null,
    index: true,
  })
  parentCategoryId: Types.ObjectId | null;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  archivedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProductCategorySchema =
  SchemaFactory.createForClass(ProductCategory);
ProductCategorySchema.index({ isActive: 1, name: 1 });
