import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CustomerDocument = HydratedDocument<Customer>;

@Schema({ _id: false })
export class CustomerAddress {
  @Prop({ trim: true, default: '' })
  street?: string;

  @Prop({ trim: true, default: '' })
  city?: string;

  @Prop({ trim: true, default: '' })
  state?: string;

  @Prop({ trim: true, default: '' })
  postalCode?: string;

  @Prop({ trim: true, default: '' })
  country?: string;
}

export const CustomerAddressSchema =
  SchemaFactory.createForClass(CustomerAddress);

@Schema({ timestamps: true, collection: 'sales_customers' })
export class Customer {
  @Prop({
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    index: true,
  })
  code: string;

  @Prop({ required: true, trim: true, index: true })
  name: string;

  @Prop({ required: true, trim: true, index: true })
  phone: string;

  @Prop({
    type: String,
    trim: true,
    lowercase: true,
    default: null,
    index: true,
  })
  email: string | null;

  @Prop({ type: CustomerAddressSchema, default: () => ({}) })
  billingAddress: CustomerAddress;

  @Prop({ type: CustomerAddressSchema, default: () => ({}) })
  shippingAddress: CustomerAddress;

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  archivedAt?: Date | null;

  @Prop({
    type: {
      id: { type: String, required: true },
      email: { type: String, required: true },
      name: { type: String },
    },
    required: true,
  })
  createdBy: { id: string; email: string; name?: string };

  @Prop({
    type: {
      id: { type: String, required: true },
      email: { type: String, required: true },
      name: { type: String },
    },
    default: null,
  })
  updatedBy?: { id: string; email: string; name?: string } | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

CustomerSchema.index({ name: 1, isActive: 1 });
CustomerSchema.index({ createdAt: -1 });
