import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { MessageController } from './message.controller.js';
import { MessageService } from './message.service.js';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService],
})
export class MessageModule {}
