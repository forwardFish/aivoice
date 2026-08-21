import { Body, Controller, Delete, Get, Headers, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateExactSpeechDto, CreateMessageDto } from './message.dto.js';
import { MessageService } from './message.service.js';

@Controller()
@UseGuards(AuthGuard)
export class MessageController {
  constructor(@Inject(MessageService) private readonly messages: MessageService) {}

  @Get('voices/:voiceId/conversation')
  conversation(@CurrentUser() user: AuthenticatedUser, @Param('voiceId') voiceId: string) {
    return this.messages.conversation(user.id, voiceId);
  }

  @Delete('voices/:voiceId/conversation')
  clear(@CurrentUser() user: AuthenticatedUser, @Param('voiceId') voiceId: string) {
    return this.messages.clearConversation(user.id, voiceId);
  }

  @Post('voices/:voiceId/messages')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  chat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('voiceId') voiceId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: CreateMessageDto,
  ) {
    return this.messages.create({ userId: user.id, voiceId, idempotencyKey, text: body.text, mode: 'CHAT' });
  }

  @Post('voices/:voiceId/exact-speech')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  exactSpeech(
    @CurrentUser() user: AuthenticatedUser,
    @Param('voiceId') voiceId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: CreateExactSpeechDto,
  ) {
    return this.messages.create({ userId: user.id, voiceId, idempotencyKey, text: body.text, mode: 'EXACT_SPEECH' });
  }

  @Get('messages/:messageId')
  get(@CurrentUser() user: AuthenticatedUser, @Param('messageId') messageId: string) {
    return this.messages.get(user.id, messageId);
  }
}
