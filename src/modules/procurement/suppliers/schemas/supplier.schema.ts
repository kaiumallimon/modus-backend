import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class SupplierAddress {
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

export const SupplierAddressSchema =
  SchemaFactory.createForClass(SupplierAddress);

@Schema({ _id: false })
export class SupplierContact {
  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: String, default: '', trim: true })
  role?: string;

  @Prop({ type: String, default: '', lowercase: true, trim: true })
  email?: string;

  @Prop({ type: String, default: '', trim: true })
  phone?: string;

  @Prop({ type: Boolean, default: false })
  isPrimary?: boolean;
}

export const SupplierContactSchema =
  SchemaFactory.createForClass(SupplierContact);

export type SupplierDocument = HydratedDocument<Supplier>;

@Schema({ timestamps: true, collection: 'procurement_suppliers' })
export class Supplier {
  @Prop({ type: String, required: true, trim: true, index: true })
  name: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  })
  code: string;

  @Prop({ type: String, required: true, trim: true })
  contactPerson: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: String, required: true, trim: true })
  phone: string;

  @Prop({ type: String, default: '', trim: true })
  alternativePhone?: string;

  @Prop({ type: SupplierAddressSchema, default: () => ({}) })
  address: SupplierAddress;

  @Prop({ type: String, default: '', trim: true })
  website?: string;

  @Prop({ type: String, default: '', trim: true })
  taxId?: string;

  @Prop({ type: String, default: '', trim: true })
  notes?: string;

  @Prop({ type: [SupplierContactSchema], default: [] })
  contacts: SupplierContact[];

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  deactivatedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);
SupplierSchema.index({ isActive: 1, name: 1 });
SupplierSchema.index({ email: 1 });
