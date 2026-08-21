import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { QuotaController, QuotaLedgerController } from './quota.controller.js';
import { QuotaService } from './quota.service.js';

@Module({
  imports: [AuthModule],
  controllers: [QuotaController, QuotaLedgerController],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
