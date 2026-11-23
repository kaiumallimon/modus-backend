import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type SystemSettingsDocument = HydratedDocument<SystemSettings>;

export const SINGLETON_SYSTEM_SETTINGS_KEY = 'MODUS_SYSTEM_SETTINGS_SINGLETON';

@Schema({ timestamps: true, collection: 'system_settings' })
export class SystemSettings {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: SINGLETON_SYSTEM_SETTINGS_KEY,
  })
  key: string;

  @Prop({
    type: String,
    default: 'UTC',
    trim: true,
  })
  defaultTimezone: string;

  @Prop({
    type: String,
    default: 'en-US',
    trim: true,
  })
  defaultLocale: string;

  @Prop({
    type: String,
    default: 'USD',
    uppercase: true,
    trim: true,
  })
  defaultCurrency: string;

  @Prop({
    type: String,
    default: 'YYYY-MM-DD',
    trim: true,
  })
  dateFormat: string;

  @Prop({
    type: String,
    default: 'HH:mm:ss',
    trim: true,
  })
  timeFormat: string;

  @Prop({
    type: Number,
    default: 10,
    min: 1,
    max: 100,
  })
  defaultPaginationLimit: number;

  @Prop({
    type: Boolean,
    default: true,
  })
  allowPasswordReset: boolean;

  @Prop({
    type: Number,
    default: 60,
    min: 5,
    max: 1440,
  })
  sessionTimeoutMinutes: number;

  @Prop({
    type: MongooseSchema.Types.Mixed,
    default: {},
  })
  customPreferences: Record<string, any>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SystemSettingsSchema =
  SchemaFactory.createForClass(SystemSettings);
