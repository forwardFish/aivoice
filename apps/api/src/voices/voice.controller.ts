import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ConfirmConsentDto, CreateVoiceDto, UpdateClipDto, UpdateVoiceProfileDto } from './voice.dto.js';
import { VoiceService } from './voice.service.js';

@Controller()
@UseGuards(AuthGuard)
export class VoiceController {
  constructor(@Inject(VoiceService) private readonly voices: VoiceService) {}

  @Get('home')
  home(@CurrentUser() user: AuthenticatedUser) {
    return this.voices.home(user.id);
  }

  @Get('voices')
  list(@CurrentUser() user: AuthenticatedUser, @Query('status') status = '') {
    return this.voices.list(user.id, status.split(',').map((value) => value.trim()).filter(Boolean));
  }

  @Post('voices')
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateVoiceDto) {
    return this.voices.createDraft(user.id, body.name);
  }

  @Get('voices/:voiceId')
  get(@CurrentUser() user: AuthenticatedUser, @Param('voiceId') voiceId: string) {
    return this.voices.get(user.id, voiceId);
  }

  @Get('voices/:voiceId/preview')
  preview(@CurrentUser() user: AuthenticatedUser, @Param('voiceId') voiceId: string) {
    return this.voices.preview(user.id, voiceId);
  }

  @Put('voices/:voiceId/clip')
  clip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('voiceId') voiceId: string,
    @Body() body: UpdateClipDto,
  ) {
    return this.voices.updateClip(user.id, voiceId, body.startMs, body.endMs);
  }

  @Put('voices/:voiceId/profile')
  profile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('voiceId') voiceId: string,
    @Body() body: UpdateVoiceProfileDto,
  ) {
    return this.voices.updateProfile(user.id, voiceId, {
      name: body.name,
      permissionType: body.permissionType,
      relationshipType: body.relationshipType,
      relationshipLabel: body.relationshipLabel,
      userAddress: body.userAddress,
    });
  }

  @Post('voices/:voiceId/consents')
  consent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('voiceId') voiceId: string,
    @Body() body: ConfirmConsentDto,
  ) {
    return this.voices.confirmConsent(user.id, voiceId, {
      version: body.consentVersion,
      text: body.consentText,
      confirmed: body.confirmed,
    });
  }

  @Post('voices/:voiceId/process')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  process(@CurrentUser() user: AuthenticatedUser, @Param('voiceId') voiceId: string) {
    return this.voices.process(user.id, voiceId);
  }

  @Post('voices/:voiceId/accept-preview')
  accept(@CurrentUser() user: AuthenticatedUser, @Param('voiceId') voiceId: string) {
    return this.voices.acceptPreview(user.id, voiceId);
  }

  @Post('voices/:voiceId/preview-played')
  previewPlayed(@CurrentUser() user: AuthenticatedUser, @Param('voiceId') voiceId: string) {
    return this.voices.markPreviewPlayed(user.id, voiceId);
  }

  @Post('voices/:voiceId/retry-preview')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  retry(@CurrentUser() user: AuthenticatedUser, @Param('voiceId') voiceId: string) {
    return this.voices.retryPreview(user.id, voiceId);
  }

  @Delete('voices/:voiceId')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('voiceId') voiceId: string) {
    return this.voices.deleteVoice(user.id, voiceId);
  }
}
