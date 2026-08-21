import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { WechatCodeExchanger } from './wechat-code-exchanger.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, WechatCodeExchanger],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
