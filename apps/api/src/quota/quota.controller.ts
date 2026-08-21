import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { QuotaService } from './quota.service.js';

@Controller('voices/:voiceId/quota')
@UseGuards(AuthGuard)
export class QuotaController {
  constructor(@Inject(QuotaService) private readonly quotaService: QuotaService) {}

  @Get()
  quota(@CurrentUser() user: AuthenticatedUser, @Param('voiceId') voiceId: string) {
    return this.quotaService.getQuota(user.id, voiceId);
  }
}

@Controller('quota-ledgers')
@UseGuards(AuthGuard)
export class QuotaLedgerController {
  constructor(@Inject(QuotaService) private readonly quotaService: QuotaService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.quotaService.listLedgers(user.id);
  }
}

@Controller('points')
@UseGuards(AuthGuard)
export class PointsController {
  constructor(@Inject(QuotaService) private readonly quotaService: QuotaService) {}

  @Get()
  points(@CurrentUser() user: AuthenticatedUser) {
    return this.quotaService.getPoints(user.id);
  }

  @Get('ledgers')
  ledgers(@CurrentUser() user: AuthenticatedUser) {
    return this.quotaService.listPointLedgers(user.id);
  }
}
