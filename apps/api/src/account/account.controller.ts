import { Controller, Delete, Inject, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AccountService } from './account.service.js';

@Controller('account')
@UseGuards(AuthGuard)
export class AccountController {
  constructor(@Inject(AccountService) private readonly accounts: AccountService) {}

  @Delete()
  remove(@CurrentUser() user: AuthenticatedUser) {
    return this.accounts.deleteAccount(user.id);
  }
}
