import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../enums/role.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    trim: true,
    index: true,
  })
  humanId?: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({
    type: String,
    required: true,
  })
  passwordHash: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  firstName: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  lastName: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    default: Role.EMPLOYEE,
    index: true,
  })
  role: string;

  @Prop({
    type: String,
    default: null,
    trim: true,
  })
  avatarUrl?: string | null;

  @Prop({
    type: Boolean,
    default: true,
  })
  isActive: boolean;

  @Prop({
    type: String,
    default: null,
  })
  hashedRefreshToken: string | null;

  @Prop({
    type: String,
    default: null,
    index: true,
  })
  resetPasswordTokenHash: string | null;

  @Prop({
    type: Date,
    default: null,
  })
  resetPasswordExpiresAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
