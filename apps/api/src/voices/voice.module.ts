import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { QuotaModule } from '../quota/quota.module.js';
import { MediaModule } from '../media/media.module.js';
import { VoiceController } from './voice.controller.js';
import { VoiceService } from './voice.service.js';

@Module({
  imports: [AuthModule, QuotaModule, MediaModule],
  controllers: [VoiceController],
  providers: [VoiceService],
  exports: [VoiceService],
})
export class VoiceModule {}
