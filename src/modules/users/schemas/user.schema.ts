import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../enums/role.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
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
    enum: Role,
    default: Role.EMPLOYEE,
  })
  role: Role;

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

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
