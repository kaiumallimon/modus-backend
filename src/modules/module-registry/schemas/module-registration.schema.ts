import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ModuleRegistrationDocument = HydratedDocument<ModuleRegistration>;

@Schema({ _id: false })
export class ModulePermissionEntry {
  @Prop({ type: String, required: true })
  id: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true })
  description: string;
}

export const ModulePermissionEntrySchema =
  SchemaFactory.createForClass(ModulePermissionEntry);

@Schema({ timestamps: true, collection: 'module_registry' })
export class ModuleRegistration {
  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  id: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  name: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
  })
  description: string;

  @Prop({
    type: String,
    default: '1.0.0',
    trim: true,
  })
  version: string;

  @Prop({
    type: Boolean,
    default: false,
    index: true,
  })
  isCore: boolean;

  @Prop({
    type: Boolean,
    default: false,
    index: true,
  })
  isActivated: boolean;

  @Prop({
    type: [String],
    default: [],
  })
  dependencies: string[];

  @Prop({
    type: [ModulePermissionEntrySchema],
    default: [],
  })
  permissions: ModulePermissionEntry[];

  @Prop({
    type: Date,
    default: null,
  })
  activatedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ModuleRegistrationSchema =
  SchemaFactory.createForClass(ModuleRegistration);
