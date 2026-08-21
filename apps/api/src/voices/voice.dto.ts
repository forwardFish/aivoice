import { IsBoolean, IsIn, IsInt, IsString, MaxLength, Min } from 'class-validator';

export class CreateVoiceDto {
  @IsString()
  @MaxLength(40)
  name = '';
}

export class UpdateClipDto {
  @IsInt()
  @Min(0)
  startMs!: number;

  @IsInt()
  @Min(1)
  endMs!: number;
}

export class UpdateVoiceProfileDto {
  @IsString()
  @MaxLength(40)
  name!: string;

  @IsIn(['SELF', 'OTHER', 'MINOR'])
  permissionType!: 'SELF' | 'OTHER' | 'MINOR';
}

export class ConfirmConsentDto {
  @IsString()
  consentVersion!: string;

  @IsString()
  consentText!: string;

  @IsBoolean()
  confirmed!: boolean;
}
