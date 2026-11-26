import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class InventoryActor {
  @Prop({ type: String, required: true })
  id: string;

  @Prop({ type: String, required: true })
  email: string;

  @Prop({ type: String, required: false })
  humanId?: string;

  @Prop({ type: String, required: false })
  role?: string;
}

export const InventoryActorSchema =
  SchemaFactory.createForClass(InventoryActor);
