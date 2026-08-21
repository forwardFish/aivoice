import { IsString, IsUUID } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  productCode!: string;

  @IsUUID()
  voiceId!: string;
}
