import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './auth.types.js';

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  authToken: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const user = await this.authService.authenticate(token);
    if (!user) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Login required' });
    request.user = user;
    request.authToken = token;
    return true;
  }
}
