import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ _id: false })
export class AuditActor {
  @Prop({ type: String, required: true })
  id: string;

  @Prop({ type: String, required: true })
  email: string;

  @Prop({ type: String, required: false })
  humanId?: string;

  @Prop({ type: String, required: false })
  role?: string;
}

export const AuditActorSchema = SchemaFactory.createForClass(AuditActor);

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ type: AuditActorSchema, required: true })
  actor: AuditActor;

  @Prop({ type: String, required: true, index: true })
  action: string;

  @Prop({ type: String, required: true, index: true })
  resource: string;

  @Prop({ type: String, required: false, index: true })
  resourceId?: string;

  @Prop({ type: String, required: true })
  description: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: Record<string, any>;

  @Prop({ type: String, required: false })
  ipAddress?: string;

  @Prop({ type: String, required: false })
  userAgent?: string;

  createdAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1 });
