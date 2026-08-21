import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class ProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}

export class WechatLoginDto {
  @IsString()
  code!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileDto)
  profile?: ProfileDto;
}

export class UpdateProfileDto extends ProfileDto {}
