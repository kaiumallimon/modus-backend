import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RoleDocument = HydratedDocument<RoleEntity>;

@Schema({ timestamps: true, collection: 'roles' })
export class RoleEntity {
  @Prop({
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  })
  code: string;

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
    type: [String],
    default: [],
  })
  permissions: string[];

  @Prop({
    type: Boolean,
    default: false,
  })
  isSystem: boolean;

  @Prop({
    type: Boolean,
    default: true,
  })
  isActive: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RoleSchema = SchemaFactory.createForClass(RoleEntity);
