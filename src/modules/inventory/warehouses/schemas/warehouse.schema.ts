import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WarehouseDocument = HydratedDocument<Warehouse>;

@Schema({ _id: false })
export class WarehouseAddress {
  @Prop({ type: String, default: '', trim: true })
  street?: string;

  @Prop({ type: String, default: '', trim: true })
  city?: string;

  @Prop({ type: String, default: '', trim: true })
  state?: string;

  @Prop({ type: String, default: '', trim: true })
  postalCode?: string;

  @Prop({ type: String, default: '', trim: true })
  country?: string;
}

export const WarehouseAddressSchema =
  SchemaFactory.createForClass(WarehouseAddress);

@Schema({ timestamps: true, collection: 'inventory_warehouses' })
export class Warehouse {
  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  })
  code: string;

  @Prop({ type: String, default: '', trim: true })
  description: string;

  @Prop({ type: WarehouseAddressSchema, default: () => ({}) })
  address: WarehouseAddress;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  deactivatedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const WarehouseSchema = SchemaFactory.createForClass(Warehouse);
WarehouseSchema.index({ isActive: 1, name: 1 });
