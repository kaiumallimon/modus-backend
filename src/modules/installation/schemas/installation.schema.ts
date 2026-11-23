import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InstallationDocument = HydratedDocument<Installation>;

export const SINGLETON_INSTALLATION_KEY = 'MODUS_INSTALLATION_SINGLETON';

@Schema({ timestamps: true, collection: 'installation' })
export class Installation {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: SINGLETON_INSTALLATION_KEY,
  })
  key: string;

  @Prop({
    type: Boolean,
    default: false,
  })
  isInitialized: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  initializedAt: Date | null;

  @Prop({
    type: String,
    default: '1.0.0',
  })
  version: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const InstallationSchema = SchemaFactory.createForClass(Installation);
