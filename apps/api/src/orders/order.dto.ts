import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  productCode!: string;

  @IsUUID()
  @IsOptional()
  voiceId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  wxLoginCode?: string;
}
