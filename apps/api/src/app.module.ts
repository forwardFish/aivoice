import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller.js';
import { DatabaseModule } from './db/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { QuotaModule } from './quota/quota.module.js';
import { OrderModule } from './orders/order.module.js';
import { VoiceModule } from './voices/voice.module.js';
import { MediaModule } from './media/media.module.js';
import { MessageModule } from './messages/message.module.js';
import { AccountModule } from './account/account.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    AuthModule,
    QuotaModule,
    OrderModule,
    MediaModule,
    VoiceModule,
    MessageModule,
    AccountModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
