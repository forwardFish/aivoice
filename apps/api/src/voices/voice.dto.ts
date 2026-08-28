import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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

  @IsOptional()
  @IsIn(['SELF', 'MOTHER', 'FATHER', 'GRANDMOTHER', 'GRANDFATHER', 'CHILD', 'PARTNER', 'FRIEND', 'OTHER'])
  relationshipType?: 'SELF' | 'MOTHER' | 'FATHER' | 'GRANDMOTHER' | 'GRANDFATHER' | 'CHILD' | 'PARTNER' | 'FRIEND' | 'OTHER';

  @IsOptional()
  @IsString()
  @MaxLength(10)
  relationshipLabel = '';

  @IsOptional()
  @IsString()
  @MaxLength(10)
  userAddress = '';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  ageYears?: number;

  @IsOptional()
  @IsIn(['FEMALE', 'MALE'])
  gender?: 'FEMALE' | 'MALE';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  userAgeYears?: number;

  @IsOptional()
  @IsIn(['CHILD', 'TEEN', 'ADULT', 'OLDER_ADULT'])
  userLifeStage?: 'CHILD' | 'TEEN' | 'ADULT' | 'OLDER_ADULT';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  background = '';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  relationshipNote = '';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  personalityNote = '';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  speechHabitNote = '';
}

export class ConfirmConsentDto {
  @IsString()
  consentVersion!: string;

  @IsString()
  consentText!: string;

  @IsBoolean()
  confirmed!: boolean;
}
