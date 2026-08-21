import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  text!: string;
}

export class CreateExactSpeechDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  text!: string;
}
