import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UnitOfMeasurementDocument = HydratedDocument<UnitOfMeasurement>;

@Schema({ timestamps: true, collection: 'inventory_units' })
export class UnitOfMeasurement {
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

  @Prop({ type: String, required: true, trim: true })
  symbol: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  normalizedSymbol: string;

  @Prop({ type: String, default: '', trim: true })
  description: string;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  archivedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const UnitOfMeasurementSchema =
  SchemaFactory.createForClass(UnitOfMeasurement);
UnitOfMeasurementSchema.index({ isActive: 1, name: 1 });
