import { Body, Controller, Get, Headers, Inject, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from './auth.types.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import { UpdateProfileDto, WechatLoginDto } from './auth.dto.js';

@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('auth/wechat')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(
    @Body() body: WechatLoginDto,
    @Headers('x-wx-openid') openid = '',
    @Headers('x-wx-appid') appid = '',
  ) {
    return this.authService.login(body, { openid, appid });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }

  @Patch('me/profile')
  @UseGuards(AuthGuard)
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateProfileDto) {
    return this.authService.updateProfile(user.id, body);
  }

  @Post('auth/logout')
  @UseGuards(AuthGuard)
  async logout(@Req() request: AuthenticatedRequest) {
    await this.authService.revoke(request.authToken);
    return { success: true };
  }
}
