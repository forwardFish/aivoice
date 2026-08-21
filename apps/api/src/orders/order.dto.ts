import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  productCode!: string;

  @IsUUID()
  @IsOptional()
  voiceId?: string;
}
