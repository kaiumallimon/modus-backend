import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrganizationSettingsDocument = HydratedDocument<OrganizationSettings>;

export const SINGLETON_ORGANIZATION_KEY = 'MODUS_ORGANIZATION_SINGLETON';

@Schema({ _id: false })
export class Address {
  @Prop({ type: String, default: '' })
  street?: string;

  @Prop({ type: String, default: '' })
  city?: string;

  @Prop({ type: String, default: '' })
  state?: string;

  @Prop({ type: String, default: '' })
  postalCode?: string;

  @Prop({ type: String, default: '' })
  country?: string;
}

export const AddressSchema = SchemaFactory.createForClass(Address);

@Schema({ timestamps: true, collection: 'organization_settings' })
export class OrganizationSettings {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: SINGLETON_ORGANIZATION_KEY,
  })
  key: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    default: 'Modus Organization',
  })
  name: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
  })
  legalName: string;

  @Prop({
    type: String,
    default: null,
  })
  logo: string | null;

  @Prop({
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    default: 'contact@modus.local',
  })
  email: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
  })
  phone: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
  })
  website: string;

  @Prop({
    type: AddressSchema,
    default: () => ({}),
  })
  address: Address;

  @Prop({
    type: String,
    default: 'USD',
    uppercase: true,
    trim: true,
  })
  currency: string;

  @Prop({
    type: String,
    default: 'UTC',
    trim: true,
  })
  timezone: string;

  @Prop({
    type: String,
    default: 'en-US',
    trim: true,
  })
  locale: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const OrganizationSettingsSchema =
  SchemaFactory.createForClass(OrganizationSettings);
